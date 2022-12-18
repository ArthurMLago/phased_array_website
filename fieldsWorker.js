var globals = {
    wsInstance: 0,
    outImage: 0,
    outOffset: 0,
    antennasOffset: 0,
    feedsOffset: 0,
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
        globals.wsInstance.exports.exportedFree(globals.antennasOffset);
    }
    globals.antennasOffset = globals.wsInstance.exports.exportedMalloc(antennasSize);
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
        globals.wsInstance.exports.exportedFree(globals.feedsOffset);
    }
    globals.feedsOffset = globals.wsInstance.exports.exportedMalloc(feedsSize);
    console.log("globals.feedsOffset: " + globals.feedsOffset);
    const feedsArray = new Float32Array(globals.bigMem.buffer, globals.feedsOffset, data.ants.length * 2);
    for (i = 0; i < data.ants.length; i++){
        feedsArray[i*2 + 0] = data.feeds[i].re;
        feedsArray[i*2 + 1] = data.feeds[i].im;
    }

    // Output Image:
    let outSize = Uint8Array.BYTES_PER_ELEMENT * data.width * data.height * 4;
    if (globals.outOffset > 0){
        globals.wsInstance.exports.exportedFree(globals.outOffset);
    }
    globals.outOffset = globals.wsInstance.exports.exportedMalloc(outSize);
    console.log("globals.outOffset: " + globals.feedsOffset);
    globals.outImage = new Uint8Array(globals.bigMem.buffer, globals.outOffset, data.width * data.height * 4);
    globals.wsInstance.exports.updateParams(data.nthreads, data.ants.length, globals.antennasOffset, globals.feedsOffset, data.startX, data.startY, data.drawScale, data.resolution, data.width, data.height, data.carrierFreq, data.waveSpeed);
    globals.alreadySetup = true;
}

onmessage = (e) => {
    console.log('Message received from main script');
    console.log(e.data);
    switch(e.data.command){
        case "init":
            globals.bigMem = new WebAssembly.Memory({
                initial: 2048,
                maximum: 4096,
                shared: crossOriginIsolated,
            });
            const enviro = {
                memory: globals.bigMem,
                consolelogf: v => console.log("C++ consolelogf: " + v),
                consoleloga: v => console.log("C++ console addr:: " + v),
                emscripten_notify_memory_growth: v => console.log("emsncripten grow!" + v),
            }
            console.log(globals.bigMem.buffer.byteLength);

            WebAssembly.instantiate(e.data.module, {env:enviro}).then(function(instance){
                globals.wsInstance = instance;
                console.log(instance);
                console.log(instance.exports);
                console.log(globals.bigMem.buffer.byteLength);
            });
            globals.alreadySetup = false;
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
            console.log("getMag")
            if (globals.wsInstance != 0){
                if (globals.alreadySetup == false){
                    if (globals.savedUpdate != 0){
                        sendUpdate(globals.savedUpdate);
                    }else{
                        console.log("getMag called, no updateParams was done, and we have none queue, not cool");
                        return;
                    }
                }
                globals.wsInstance.exports.getMagnitudeImage(globals.outOffset);
                console.log(globals.outImage)
                postMessage(globals.outImage);
            }
            break;
        case "getField":
            if (globals.wsInstance != 0){
                if (globals.alreadySetup == false){
                    if (globals.savedUpdate != 0){
                        sendUpdate(globals.savedUpdate);
                    }else{
                        console.log("getField called, no updateParams was done, and we have none queue, not cool");
                        return;
                    }
                }
                globals.wsInstance.exports.getFieldImage(e.data.time, globals.outOffset);
                postMessage(globals.outImage);
            }

            break;

    }
}

