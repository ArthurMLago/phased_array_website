

var formConfigurations = {
    drawElectricField: false,
    drawMagnitude: false,
    drawSinusoidPeak: false,
    drawSinusoidPeakSkips: 5,
    drawWavefronts: false,
    drawWavefrontsSkips: 5,
    antennas: [],
    waveSpeed: 2,
    carrierFreq: 2,
    feeds: [],
    angles: [],
    resolution: 1,
    nthreads: 4,
    antenna_center_x: 0,
    antenna_center_y: 0
}
var simulationState = {
    simulatedWorldStartX: -0.1,
    simulatedWorldStartY: -.5,
    DrawScale: 100,
    simulationTime: 0
}

var startX, startY;
var dragging;
var movingAverageRenderTime = 1/60;
var alreadyProcessing = false;
var pendingProcessing = true;
var pendingMouseUpdate = false;
var mouseStats = {};
var fieldData = 0;
var printMouseData = false;

var fieldsWorker = 0;
var fieldsWorkerReady = false;

var lastRender = Date.now();
var pendingStaticsUpdate = true;

var workerPromisesResolves = {};
var globalMsgId = 0;

const pi = 3.14159;

function sXtoP(posX){
    return (posX - simulationState.simulatedWorldStartX) * simulationState.DrawScale
}

function PtosX(pX){
    return pX/simulationState.DrawScale + simulationState.simulatedWorldStartX;
}

function sYtoP(posY){
    return (posY - simulationState.simulatedWorldStartY) * simulationState.DrawScale
}

function PtosY(pY){
    return pY/simulationState.DrawScale + simulationState.simulatedWorldStartY;
}

function updatePhaseVariation(){
    updateForm();
}

function updateForm(){
    if ($("#customAntennaSelect").prop('checked')){
        $("#customAntennaField").show();
        $("#numberElements").prop( "disabled", true );
        $("#elementsHorizontalDistance").prop( "disabled", true );

        // Set custom Feeds, no point in trying to set feeds for a non-standard antenna:
        $("#customFeedsSelect").prop("checked",true);
        $("#customFeedsSelect").prop( "disabled", true );
    }else{
        $("#customAntennaField").hide();
        $("#numberElements").prop( "disabled", false );
        $("#elementsHorizontalDistance").prop( "disabled", false );

        $("#customFeedsSelect").prop( "disabled", false);

        textAreaText = "";
        elementDistance = parseFloat($("#elementsHorizontalDistance").val());
        window.formConfigurations.antennas = [];
        for (i = 0; i < $("#numberElements").val(); i++){
            posX = elementDistance * i;
            window.formConfigurations.antennas.push([posX, 0, 0])
            textAreaText += "(" + posX + ",0,0),"
        }
        $("#customAntennaField").val(textAreaText);
    }

    if ($("#customFeedsSelect").prop('checked')){
        $("#customFeedsField").show();
        $("#wavefrontAngle").prop( "disabled", true );
        $("#phaseVariationByElement").prop( "disabled", true );
    }else{
        var phaseVar = 2 * pi * $("#elementsHorizontalDistance").val() * Math.sin($("#wavefrontAngle").val() * pi / 180) / $("#waveSpeed").val() * $("#carrierFreq").val();
        $("#phaseVariationByElement").val(phaseVar * 180 / pi);

        $("#customFeedsField").hide();
        $("#wavefrontAngle").prop( "disabled", false );
        $("#phaseVariationByElement").prop( "disabled", false );


        angleByEl = $("#phaseVariationByElement").val()/180 * pi;
        textAreaText = "";
        window.formConfigurations.feeds = []
        window.formConfigurations.angles = [];
        for (i = 0; i < $("#numberElements").val(); i++){
            angle = angleByEl * i;
            f = {re:Math.cos(angle), im:Math.sin(angle)};
            textAreaText += f.re + " + " + f.im + "i, ";
            window.formConfigurations.feeds.push(f);
            window.formConfigurations.angles.push(angle);
        }
        $("#customFeedsField").val(textAreaText);
    }

    if ($("#drawSinusoidPeaks").prop('checked')){
        $("#sinusoidPeakDetails").show();
    }else{
        $("#sinusoidPeakDetails").hide();
    }

    if ($("#drawWaveFronts").prop('checked')){
        $("#wavefrontDetails").show();
    }else{
        $("#wavefrontDetails").hide();
    }


    formConfigurations.drawElectricField = $("#drawElectricField").prop('checked');
    formConfigurations.drawMagnitude = $("#drawMagnitude").prop('checked');
    formConfigurations.drawSinusoidPeak = $("#drawSinusoidPeaks").prop('checked');
    formConfigurations.drawSinusoidPeakSkips = parseInt($("#sinusoidPeakStep").val());
    formConfigurations.drawWavefronts = $("#drawWaveFronts").prop('checked');
    formConfigurations.drawWavefrontsSkips = parseInt($("#waveFrontStep").val());
    formConfigurations.resolution = parseInt($("#resolution").val());
    formConfigurations.nthreads = parseInt($("#nthreads").val());
    formConfigurations.waveSpeed = parseFloat($("#waveSpeed").val())
    formConfigurations.carrierFreq = parseFloat($("#carrierFreq").val())


    var minx = formConfigurations.antennas[0][0];
    var maxx = formConfigurations.antennas[0][0];
    var miny = formConfigurations.antennas[0][1];
    var maxy = formConfigurations.antennas[0][1];
    formConfigurations.antennas.forEach(function(e){
        if (e[0] > maxx){
            maxx = e[0];
        }
        if (e[0] < minx){
            minx = e[0];
        }
        if (e[1] > maxy){
            maxy = e[1];
        }
        if (e[1] < miny){
            miny = e[1];
        }
    });
    formConfigurations.antenna_center_x = (maxx + minx) / 2
    formConfigurations.antenna_center_y = (maxy + miny) / 2

    let canvas = document.getElementById("fieldsCanvas");
    let context = canvas.getContext("2d");

    if (!formConfigurations.drawMagnitude && !formConfigurations.drawElectricField){
        context.clearRect(0, 0, canvas.width, canvas.height);
    }

    pendingStaticsUpdate = true;
    var d = {};
    d.command = "updateParams"
    d.ants = formConfigurations.antennas;
    d.feeds = formConfigurations.feeds;
    d.startX = simulationState.simulatedWorldStartX;
    d.startY = simulationState.simulatedWorldStartY;
    d.drawScale = simulationState.DrawScale;
    d.width = canvas.width;
    d.height = canvas.height;
    d.carrierFreq = formConfigurations.carrierFreq;
    d.waveSpeed = formConfigurations.waveSpeed;
    d.resolution = formConfigurations.resolution;
    d.nthreads = formConfigurations.nthreads;
    if (fieldsWorkerReady){
        console.log("Sending updateparams to worker")
        sendToWorker(d);
        if (!alreadyProcessing){
            if (formConfigurations.drawMagnitude){
                sendToWorker({command:"getMag"});
                alreadyProcessing = true;
            }
        }else{
            console.log("Worker is busy, send things later");
            pendingProcessing = true;
        }
    }
}

function sendToWorker(data, resolve){
    if (typeof resolve === "function"){
        workerPromisesResolves[globalMsgId] = resolve;
        data.callback = globalMsgId
        globalMsgId = (globalMsgId + 1) % 10000;
    }
    if (fieldsWorkerReady){
        window.fieldsWorker.postMessage(data);
    }
}

function workerCallback(e){
    alreadyProcessing = false;
    if (e.data.type == "field"){
        window.fieldData = e.data.data;
    }else if(e.data.type == "mag"){
        if (formConfigurations.drawMagnitude){
            let canvas = document.getElementById("fieldsCanvas");
            if (e.data.data.length == canvas.width * canvas.height * 4){
                let context = canvas.getContext("2d");
                let img = new ImageData(new Uint8ClampedArray(e.data.data), canvas.width,canvas.height);
                context.putImageData(img, 0, 0);
            }
        }
    }else if(e.data.type == "mouse"){
        window.mouseStats = e.data.data;
    }else if(e.data.type == "ready"){
        fieldsWorkerReady = true;
    }
    if (typeof e.data.callback !== 'undefined') {
        workerPromisesResolves[e.data.callback]();
        delete workerPromisesResolves[e.data.callback];
    }
    if (pendingProcessing){
        updateForm();
        pendingProcessing = false;
    }
}


async function animate(){

    let delta = Date.now() - lastRender;
    lastRender += delta;
    movingAverageRenderTime = movingAverageRenderTime * 0.97 + delta * 0.03;
    let nextSimulationTime = simulationState.simulationTime + delta/1000 /3e9;

    if (formConfigurations.drawElectricField){
        let canvas = document.getElementById("fieldsCanvas");
        if (window.fieldData.length == canvas.width * canvas.height * 4){
            let context = canvas.getContext("2d");
            let img = new ImageData(new Uint8ClampedArray(window.fieldData), canvas.width,canvas.height);
            context.putImageData(img, 0, 0);
        }
    }
    // Now that we used our data, go ahead and request for new one:
    var fieldDrawnPromise = 0;
    if (formConfigurations.drawElectricField && fieldsWorkerReady){
        fieldDrawnPromise = new Promise(function(resolve, reject){
            sendToWorker({command:"getField", time: nextSimulationTime}, resolve);
        });
    }

    var animatedDiagramsPromise = animateDiagrams(nextSimulationTime);

    if (pendingStaticsUpdate){
        drawStaticElements();
        pendingStaticsUpdate = false;
    }

    simulationState.simulationTime = nextSimulationTime;
    // We only request a new frame when all data from worker is ready:
    await Promise.all([fieldDrawnPromise, animatedDiagramsPromise]);
    console.log("aaa");
    requestAnimationFrame(animate);
}

function drawStaticElements(){

    let canvas = document.getElementById("staticElementsCanvas");
    let context = canvas.getContext("2d");

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.beginPath();

    context.strokeStyle = "#eeeeff";
    for (var i = 0; i < formConfigurations.antennas.length; i++) {
        const ant = formConfigurations.antennas[i];
        context.moveTo(sXtoP(ant[0]), sYtoP(ant[1]));
        context.lineTo(sXtoP(ant[0]), sYtoP(ant[1]) + 30);
        context.moveTo(sXtoP(ant[0]), sYtoP(ant[1]) + 15);
        context.lineTo(sXtoP(ant[0]) + 15, sYtoP(ant[1]));
        context.moveTo(sXtoP(ant[0]), sYtoP(ant[1]) + 15);
        context.lineTo(sXtoP(ant[0]) - 15, sYtoP(ant[1]));

        context.rect(sXtoP(ant[0]) - 15, sYtoP(ant[1]) + 30, 30, 30);

        context.textAlign = "center"
        context.textBaseline = "middle";
        context.fillStyle = "orange";
        context.fillText(((formConfigurations.angles[i] * 180 / pi)%360).toFixed(1), sXtoP(ant[0]), sYtoP(ant[1]) + 50);
    }
    context.stroke();

}

async function animateDiagrams(nextTime){
    let canvas = document.getElementById("diagramCanvas");
    let context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);

    var mousePromise = 0;
    if (window.printMouseData){
        context.textBaseline = "bottom";
        context.fillStyle = "#dddddd";
        var mouseText = "Mouse position:\nx: " + window.mouseStats.x + ", y: " + window.mouseStats.y + " (dist: " + window.mouseStats.distance + ", azimuth: " + window.mouseStats.azimuth + ")\n";
        mouseText += "At that position:\n";
        mouseText += "Mag: "+ window.mouseStats.magnitude + "(" + window.mouseStats.magdb + " dB), Phase: " + window.mouseStats.phase + "\n";
        mouseText += "Electric field: " + window.mouseStats.re + ", Magnetic field: " + window.mouseStats.im + "\n";
        mouseText += "At that azimuth in far range:\n";
        mouseText += "Mag: " + window.mouseStats.far_field_mag + " (" + window.mouseStats.far_field_magdb + " dB)";
        context.fillText(mouseText, canvas.width - 16, canvas.height - 50);
        console.log("promise fulfilled");

        // Now that we used the mouse data, go ahead and requst new one:
        if (fieldsWorkerReady){
            mousePromise = new Promise(function(resolve, reject){
                sendToWorker({command: "getMouse", t: nextTime, mx: PtosX(startX), my: PtosY(startY), cx: formConfigurations.antenna_center_x, cy: formConfigurations.antenna_center_y}, resolve);
            });
        }
    }

    context.beginPath();
    // Draw wave peaks
    if (formConfigurations.drawSinusoidPeak){
        var waveLen = formConfigurations.waveSpeed / formConfigurations.carrierFreq;
        var steps = formConfigurations.drawSinusoidPeakSkips;
        var distancePeaks = waveLen * steps;
        for (var i = 0; i < formConfigurations.antennas.length; i++) {
            var ant = formConfigurations.antennas[i];
            var elementPhase = simulationState.simulationTime * 2 * pi * formConfigurations.carrierFreq - formConfigurations.angles[i];
            var firstRadius = ((elementPhase / 2 / pi * waveLen) + 10*distancePeaks) % (distancePeaks);

            // If antenna is not visible, we may be able to skip the first circles:
            if ((ant[0] < PtosX(0)) || (ant[0] > PtosX(canvas.width)) || (ant[1] < PtosY(0)) || (ant[1] > PtosY(canvas.height))){
                var minRadius = (Math.max(0, Math.max(PtosX(0) - ant[0], ant[0] - (PtosX(canvas.width)))) ** 2
                  + Math.max(0, Math.max(PtosY(0) - ant[1], ant[1] - (PtosY(canvas.height)))) ** 2)**.5;
                firstRadius = Math.max(0, Math.floor((minRadius - firstRadius) / distancePeaks)) * distancePeaks + firstRadius;
            }

            var maxRadius = Math.max(
                    Math.pow(PtosX(0) - ant[0], 2) + Math.pow(PtosY(0) - ant[1], 2),
                    Math.pow(PtosX(0) - ant[0], 2) + Math.pow(PtosY(canvas.height) - ant[1],2),
                    Math.pow(PtosX(canvas.width) - ant[0], 2) + Math.pow(PtosY(canvas.height) - ant[1], 2),
                    Math.pow(PtosX(canvas.width) - ant[0], 2) + Math.pow(PtosY(0) - ant[1], 2),
            );
            maxRadius = Math.pow(maxRadius, .5);

            var j = 0;
            context.strokeStyle = "#dd4455";
            while(firstRadius + j * distancePeaks < maxRadius){
                context.moveTo(sXtoP(ant[0] + firstRadius + j * distancePeaks), sYtoP(ant[1]));
                context.arc(sXtoP(ant[0]), sYtoP(ant[1]), (firstRadius + j * distancePeaks) * simulationState.DrawScale, 0, 2*pi, false);
                j++;
            }
        }
    }
    if (formConfigurations.drawSinusoidPeak || formConfigurations.drawWavefronts){
        context.stroke();
    }
    // Draw FPS:
    //context.moveTo(canvas.width, 32);
    context.textAlign = "end";
    context.textBaseline = "top";
    context.fillStyle = "#dddddd";
    context.fillText((1/movingAverageRenderTime * 1e3).toFixed(2) + " FPS", canvas.width - 16, 0);

    await mousePromise;

}

function restartWorker(){
    if (window.fieldsWorker instanceof Worker){
        window.fieldsWorker.terminate();
    }
    window.fieldsWorker = 0;
    window.fieldsWorker = new Worker("fieldsWorker.js");
    window.fieldsWorker.onmessage = workerCallback;
    window.fieldsWorker.postMessage({command:"init", module:window.fieldsModule});
    //window.fieldsWorker.postMessage(["updateParams", window.fieldsModule]);

}

function onMouseUp(event){
    let canvas = document.getElementById("diagramCanvas");
    //canvas.removeEventListener('mouseup', onMouseUp, false);
    //canvas.removeEventListener('mousemove', onMouseMove, false);
    window.dragging = false;
    updateForm();
}

function onMouseMove(event){
    if (window.dragging){
        window.simulationState.simulatedWorldStartX -= (event.clientX - startX) / simulationState.DrawScale
        window.simulationState.simulatedWorldStartY -= (event.clientY - startY) / simulationState.DrawScale
        window.pendingStaticsUpdate = true;
        window.pendingMouseUpdate = true;
        //animate();
    }
    startX = event.clientX;
    startY = event.clientY;
    //console.log("Mouse is at " + startX + ", " + startY);
}

function resizeCanvas() {
    console.log("resizing canvas");
    const canvasIDs = ["diagramCanvas", "fieldsCanvas", "staticElementsCanvas"];
    canvasIDs.forEach(function(id){
        let canvas = document.getElementById(id);
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });

    updateForm();
}

$(function(){
    $(".triggerFormUpdate").change(function() {updateForm();});
    $("#drawMagnitude").change(function(){
        console.log("tihs happened");
        if ($("#drawMagnitude").prop('checked')){
            $("#drawElectricField").prop('checked', false);;
        }
        updateForm();
    });
    $("#drawElectricField").change(function(){
        console.log("that happened");
        if ($("#drawElectricField").prop('checked')){
            $("#drawMagnitude").prop('checked', false);;
        }
        updateForm();
    });
    $("#phaseVariationByElement").change(function(){
        var wavefrontAngle = Math.asin($("#phaseVariationByElement").val()/180 * pi * $("#waveSpeed").val() / $("#carrierFreq").val() / $("#elementsHorizontalDistance").val() / 2 / pi);
        $("#wavefrontAngle").val(wavefrontAngle * 180 / pi);
        updateForm();
    });

    $("#toggleConfigurationWindow").click(function(){$("#configDiv").animate({width:'toggle'},350)});
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, false);

    updateForm();
    requestAnimationFrame(animate);
    //
    wasmFeatureDetect.simd().then(function(hasSimd){console.log("SIMD support: " + hasSimd)});
    Promise.all([wasmFeatureDetect.simd(), wasmFeatureDetect.bulkMemory(), wasmFeatureDetect.threads()]).then(function(ret){
        console.log("crossOriginIsolated support(SharedArrayBuffer in postMessage support) : " + crossOriginIsolated);
        console.log("WASM SIMD Support:" + ret[0]);
        console.log("WASM Bulk Memory Support:" + ret[1]);
        console.log("WASM Threads Support:" + ret[2]);

        var wasm_filename = "compiled_wasm/fields";
        if (crossOriginIsolated){
            wasm_filename += "_sm";
        }
        if (ret[0]){
            wasm_filename += "_simd";
        }
        if (ret[1]){
            wasm_filename += "_bm";
        }
        // Threads will only work if we also have shared memories available:
        if (ret[2] && crossOriginIsolated && false){
            wasm_filename += "_th";
        }
        wasm_filename += ".wasm";
        //wasm_filename = "fields.wasm"

        WebAssembly.compileStreaming(fetch(wasm_filename)).then(function(module){
            window.fieldsModule = module;
            restartWorker()
        });

    });

    let canvas = document.getElementById("diagramCanvas");
    canvas.addEventListener('mousedown', function (event) {
        startX = event.clientX;
        startY = event.clientY;
        window.dragging = true;
        console.log(startX)
    }, false);
    canvas.addEventListener('mouseup', onMouseUp, false);
    canvas.addEventListener('mousemove', onMouseMove, false);

    canvas.addEventListener('wheel',function(event){
        let lastDrawScale = window.simulationState.DrawScale;
        let canvas = document.getElementById("diagramCanvas");

        let mouseX = PtosX(window.startX);
        let mouseY = PtosY(window.startY);
        window.simulationState.DrawScale *= Math.pow(1.01, -event.deltaY/10);
        simulationState.simulatedWorldStartX = mouseX - window.startX/window.simulationState.DrawScale
        simulationState.simulatedWorldStartY = mouseY - window.startY/window.simulationState.DrawScale

        window.pendingStaticsUpdate = true;
        updateForm();
        event.preventDefault();
    }, false);


});
