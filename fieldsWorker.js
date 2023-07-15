var globals = {
    wsInstance: 0,
    outImage: 0,
    outDiagram: 0,
    outOffset: 0,
    antennasOffset: 0,
    feedsOffset: 0,
    diagramOffset: 0,
    bigMem: 0,
    alreadySetup: false,
    savedUpdate: 0
}


function sendUpdate(data){
    console.log("updateParams")
    console.log(globals.wsInstance);

    // Antennas:
    let antennasSize = Float32Array.BYTES_PER_ELEMENT * data.ants.length * 3;
    if (globals.antennasOffset > 0){
        globals.wsInstance._exportedFree(globals.antennasOffset);
    }
    globals.antennasOffset = globals.wsInstance._exportedMalloc(antennasSize);
    console.log("globals.antennasOffset: " + globals.antennasOffset);
    const antArray = new Float32Array(globals.bigMem.buffer, globals.antennasOffset, data.ants.length * 3);
    for (i = 0; i < data.ants.length; i++){
        antArray[i*3 + 0] = data.ants[i][0];
        antArray[i*3 + 1] = data.ants[i][1];
        antArray[i*3 + 2] = data.ants[i][2];
    }

    // Feeds:
    let feedsSize = Float32Array.BYTES_PER_ELEMENT * data.ants.length * 2;
    if (globals.feedsOffset > 0){
        globals.wsInstance._exportedFree(globals.feedsOffset);
    }
    globals.feedsOffset = globals.wsInstance._exportedMalloc(feedsSize);
    console.log("globals.feedsOffset: " + globals.feedsOffset);
    const feedsArray = new Float32Array(globals.bigMem.buffer, globals.feedsOffset, data.ants.length * 2);
    for (i = 0; i < data.ants.length; i++){
        feedsArray[i*2 + 0] = data.feeds[i].re;
        feedsArray[i*2 + 1] = data.feeds[i].im;
    }

    // Output Image:
    let outSize = Uint8Array.BYTES_PER_ELEMENT * data.width * data.height * 4;
    if (globals.outOffset > 0){
        globals.wsInstance._exportedFree(globals.outOffset);
    }
    globals.outOffset = globals.wsInstance._exportedMalloc(outSize);
    console.log("globals.outOffset: " + globals.feedsOffset);
    globals.outImage = new Uint8Array(globals.bigMem.buffer, globals.outOffset, data.width * data.height * 4);

    // Antenna Diagram:
    let diagramSize = Float32Array.BYTES_PER_ELEMENT * 720;
    if (globals.diagramOffset > 0){
        globals.wsInstance._exportedFree(globals.diagramOffset);
    }
    globals.diagramOffset = globals.wsInstance._exportedMalloc(diagramSize);
    console.log("globals.diagramOffset: " + globals.diagramOffset);
    globals.outDiagram = new Float32Array(globals.bigMem.buffer, globals.diagramOffset, 720);

    // Call updateParams in C++:
    globals.wsInstance._updateParams(data.nthreads, data.ants.length, globals.antennasOffset, globals.feedsOffset, data.startX, data.startY, data.antennaCenterX, data.antennaCenterY, data.drawScale, data.resolution, data.width, data.height, data.carrierFreq, data.waveSpeed);
    globals.alreadySetup = true;

}

function checkReady(){
    if (globals.wsInstance != 0){
        if (globals.alreadySetup == false){
            if (globals.savedUpdate != 0){
                sendUpdate(globals.savedUpdate);
            }else{
                console.log("data requested from wasm, but no updateParams was done, and we have none queue, not cool");
                return false;
            }
        }
        return true;
    }else{
        return false;
    }
}

onmessage = (e) => {
    switch(e.data.command){
        case "init":
            globals.bigMem = new WebAssembly.Memory({
                initial: 2048,
                maximum: 4096,
                shared: crossOriginIsolated,
            });
            const importModule = {
                wasmMemory: globals.bigMem,
                //locateFile: function(path, prefix){return ((!((prefix+path).includes("compiled_wasm"))) ? prefix + "/compiled_wasm/" + path : prefix + path)},
                consolelogf: v => console.log("C++ consolelogf: " + v),
                consoleloga: v => console.log("C++ console addr:: " + v),
                emscripten_notify_memory_growth: v => console.log("emsncripten grow!" + v),
                mainScriptUrlOrBlob: e.data.filename,
            };
            importScripts(e.data.filename);
            createMyModule(importModule).then(function(instance){
                globals.wsInstance = instance;
                globals.alreadySetup = false;
                postMessage({type: "ready", callback: e.data.callback});
            });
            break;
        case "updateParams":
            // ws must be ready:
            if (globals.wsInstance != 0){
                sendUpdate(e.data);
            }else{
                globals.savedUpdate = e.data;
            }
            break;
        case "getMag":
            if (checkReady()){
                globals.wsInstance._getMagnitudeImage(globals.outOffset);
                postMessage({type: "mag", data: globals.outImage, callback: e.data.callback});
            }
            break;
        case "getField":
            if (checkReady()){
                globals.wsInstance._getFieldImage(e.data.time, globals.outOffset);
                postMessage({type: "field", data: globals.outImage, callback: e.data.callback});
            }
            break;
        case "getMouse":
            if (checkReady()){
                let address = globals.wsInstance._getMousePositionInfo(e.data.t, e.data.mx, e.data.my, e.data.cx, e.data.cy);
                const mouseStruct = new Float32Array(globals.bigMem.buffer, address, 10);
                ret = {
                    type: "mouse",
                    data:{
                        x: e.data.mx,
                        y: e.data.my,
                        magnitude: mouseStruct[0],
                        initial_phase: mouseStruct[1],
                        phase: mouseStruct[2],
                        magdb: mouseStruct[3],
                        re: mouseStruct[4],
                        im: mouseStruct[5],
                        far_field_mag: mouseStruct[6],
                        far_field_magdb: mouseStruct[7],
                        azimuth: mouseStruct[8],
                        distance: mouseStruct[9]
                    },
                    callback: e.data.callback
                };
                //console.log(ret);
                postMessage(ret);
            }
            break;
        case "getAntennaDiagram":
            if (checkReady()){
                let address = globals.wsInstance._getAntennaDiagram();
                const antennaDiagram = new Float32Array(globals.bigMem.buffer, address, 1800);
                postMessage({type: "diagram", data: antennaDiagram});
            }
            break;
    }
}

