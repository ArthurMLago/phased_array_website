var wsInstance = 0;
var inputArgs = 0;
var outImage = 0;
var outOffset = 0;
var antennasOffset = 0;
var feedsOffset = 0;
var bigMem = 0;
var changed = 0;

onmessage = (e) => {
    console.log('Message received from main script');
    console.log(e.data);
    switch(e.data.command){
        case "init":
            bigMem = new WebAssembly.Memory({
                initial: 1024,
                maximum: 2048,
                shared: false,
            });
            const enviro = {
                memory: bigMem,
                consolelogf: v => console.log("C++ consolelogf: " + v),
                consoleloga: v => console.log("C++ console addr:: " + v),
                emscripten_notify_memory_growth: v => console.log("emsncripten grow!" + v),
            }
            console.log(bigMem.buffer.byteLength);

            WebAssembly.instantiate(e.data.module, {env:enviro}).then(function(instance){
                wsInstance = instance;
                console.log(instance);
                console.log(instance.exports);
                console.log(bigMem.buffer.byteLength);
            });
            break;
        case "updateParams":
            console.log("updateParams")
            console.log(wsInstance);
            inputArgs = e.data;

            // Antennas:
            let antennasSize = Float32Array.BYTES_PER_ELEMENT * e.data.ants.length * 3;
            if (antennasOffset > 0){
                wsInstance.exports.exportedFree(antennasOffset);
            }
            antennasOffset = wsInstance.exports.exportedMalloc(antennasSize);
            console.log("antennasOffset: " + antennasOffset);
            const antArray = new Float32Array(bigMem.buffer, antennasOffset, e.data.ants.length * 3);
            for (i = 0; i < e.data.ants.length; i++){
                antArray[i*3 + 0] = e.data.ants[i][0];
                antArray[i*3 + 1] = e.data.ants[i][1];
                antArray[i*3 + 2] = e.data.ants[i][2];
            }

            // Feeds:
            let feedsSize = Float32Array.BYTES_PER_ELEMENT * e.data.ants.length * 2;
            if (feedsOffset > 0){
                wsInstance.exports.exportedFree(feedsOffset);
            }
            feedsOffset = wsInstance.exports.exportedMalloc(feedsSize);
            console.log("feedsOffset: " + feedsOffset);
            const feedsArray = new Float32Array(bigMem.buffer, feedsOffset, e.data.ants.length * 2);
            for (i = 0; i < e.data.ants.length; i++){
                feedsArray[i*2 + 0] = e.data.feeds[i].re;
                feedsArray[i*2 + 1] = e.data.feeds[i].im;
            }

            // Output Image:
            let outSize = Uint8Array.BYTES_PER_ELEMENT * e.data.width * e.data.height * 4;
            if (outOffset > 0){
                wsInstance.exports.exportedFree(outOffset);
            }
            outOffset = wsInstance.exports.exportedMalloc(outSize);
            console.log("outOffset: " + feedsOffset);
            outImage = new Uint8Array(bigMem.buffer, outOffset, e.data.width * e.data.height * 4);
            console.log("next free byte: " + wsInstance.exports.exportedMalloc(1))
            changed = 1;
            break;
        case "getMag":
            console.log("getMag")
            //console.log(inputArgs);
            //console.log(outImage);
            //console.log(bigMem);
            //console.log(bigMem.buffer.byteLength);
            wsInstance.exports.getMagnitudeImage(inputArgs.ants.length, antennasOffset, feedsOffset, inputArgs.startX, inputArgs.startY, inputArgs.drawScale, inputArgs.resolution, inputArgs.width, inputArgs.height, inputArgs.carrierFreq, inputArgs.waveSpeed, outOffset);
            //console.log("resultado:")
            //console.log(outImage);
            postMessage(outImage);
            break;
        case "getField":
            wsInstance.exports.getFieldImage(e.data.time, inputArgs.ants.length, antennasOffset, feedsOffset, inputArgs.startX, inputArgs.startY, inputArgs.drawScale, inputArgs.resolution, inputArgs.width, inputArgs.height, inputArgs.carrierFreq, inputArgs.waveSpeed, outOffset, changed);
            changed = 0;
            postMessage(outImage);

            break;

    }
    //postMessage(workerResult);
}

