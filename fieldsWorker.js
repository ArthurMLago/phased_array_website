var wsInstance = 0;
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
                shared: crossOriginIsolated,
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

            // Antennas:
            let antennasSize = Float64Array.BYTES_PER_ELEMENT * e.data.ants.length * 3;
            if (antennasOffset > 0){
                wsInstance.exports.exportedFree(antennasOffset);
            }
            antennasOffset = wsInstance.exports.exportedMalloc(antennasSize);
            console.log("antennasOffset: " + antennasOffset);
            const antArray = new Float64Array(bigMem.buffer, antennasOffset, e.data.ants.length * 3);
            for (i = 0; i < e.data.ants.length; i++){
                antArray[i*3 + 0] = e.data.ants[i][0];
                antArray[i*3 + 1] = e.data.ants[i][1];
                antArray[i*3 + 2] = e.data.ants[i][2];
            }

            // Feeds:
            let feedsSize = Float64Array.BYTES_PER_ELEMENT * e.data.ants.length * 2;
            if (feedsOffset > 0){
                wsInstance.exports.exportedFree(feedsOffset);
            }
            feedsOffset = wsInstance.exports.exportedMalloc(feedsSize);
            console.log("feedsOffset: " + feedsOffset);
            const feedsArray = new Float64Array(bigMem.buffer, feedsOffset, e.data.ants.length * 2);
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
            wsInstance.exports.updateParams(e.data.ants.length, antennasOffset, feedsOffset, e.data.startX, e.data.startY, e.data.drawScale, e.data.resolution, e.data.width, e.data.height, e.data.carrierFreq, e.data.waveSpeed);
            break;
        case "getMag":
            console.log("getMag")
            wsInstance.exports.getMagnitudeImage(outOffset);
            postMessage(outImage);
            break;
        case "getField":
            wsInstance.exports.getFieldImage(e.data.time, outOffset);
            changed = 0;
            postMessage(outImage);

            break;

    }
}

