var formConfigurations = {
    animationSpeed: 1/1000,
    drawElectricField: false,
    drawMagnitude: false,
    drawSinusoidPeak: false,
    drawSinusoidPeakSkips: 5,
    drawWavefronts: false,
    drawAntennaDiagram: false,
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
    // Draw Scale expressed in pixels per unit:
    DrawScale: 100,
    simulationTime: 0
}

var lastMouseX, lastMouseY;
var currentPointers = {};
var movingAverageRenderTime = 1/60;
var alreadyProcessing = false;
var pendingProcessing = true;
var pendingMouseUpdate = false;
var mouseStats = 0;
var fieldData = 0;
var printMouseData = true;
var antennaDiagram = [];
    let lastPinchDistance = 0;
    let lastDrawScale = 1;

var fieldsWorker = 0;
var fieldsWorkerReady = false;

var lastRender = performance.now();
var pendingStaticsUpdate = true;

var workerPromisesResolves = {};
var globalMsgId = 0;

const pi = 3.14159;

const relevantFormIds = [
    "customAntennaSelect",
    "numberElements",
    "elementsHorizontalDistance",
    "customFeedsSelect",
    "wavefrontAngle",
    "phaseVariationByElement",
    "drawSinusoidPeaks",
    "drawWaveFronts",
    "animSpeed",
    "drawElectricField",
    "drawMagnitude",
    "sinusoidPeakStep",
    "waveFrontStep",
    "drawAntennaDiagram",
    "resolution",
    "nthreads",
    "waveSpeed",
    "carrierFreq",
    "customAntennaField",
    "customFeedsField"
];

function sXtoP(posX){
    return (posX - simulationState.simulatedWorldStartX) * simulationState.DrawScale
}

function PtosX(pX){
    return pX/simulationState.DrawScale + simulationState.simulatedWorldStartX;
}

function sYtoP(posY){
    return -(posY - simulationState.simulatedWorldStartY) * simulationState.DrawScale
}

function PtosY(pY){
    return -pY/simulationState.DrawScale + simulationState.simulatedWorldStartY;
}

function zoomKeepingPosition(newScale, pixelX, pixelY){
    // Basically PtosX after equals PtosX before
    simulationState.simulatedWorldStartX = simulationState.simulatedWorldStartX + pixelX/simulationState.DrawScale - pixelX/newScale;
    simulationState.simulatedWorldStartY = simulationState.simulatedWorldStartY - pixelY/simulationState.DrawScale + pixelY/newScale;
    simulationState.DrawScale = newScale;
}

function updatePhaseVariation(){
    updateForm();
}

function readCustomAntenna(){
    // Get the text from the textbox
    var text = $('#customAntennaField').val();

    // Remove any whitespace and split the text by commas
    var coordinates = text.match(/\([^)]+\)/g);

    // Initialize the list of lists
    window.formConfigurations.antennas = [];

    // Iterate over the coordinates and group them into lists of 3
    for (var i = 0; i < coordinates.length; i++) {
        // Remove the outer parenthesis from each coordinate
        var coordinate = coordinates[i].replace(/^\(|\)$/g, '');

        // Split the coordinate by commas
        var point = coordinate.split(',');

        // If only two coordinates are provided, assume Z as zero
        if (point.length === 2) {
            point.push('0');
        }

        point = point.map(parseFloat);

        // Add the point to the list of lists
        if (point.length > 0){
            window.formConfigurations.antennas.push(point);
        }
    }
}

function readCustomFeeds(){
    // Get the text from the textbox
    var text = $('#customFeedsField').val();

    // Split the text into individual complex numbers
    var complexNumbers = text.split(',');

    // Initialize an empty array to store the parsed objects
    window.formConfigurations.feeds = [];
    window.formConfigurations.angles = [];

    // Iterate over each complex number
    for (var i = 0; i < window.formConfigurations.antennas.length; i++) {
        // Initialize variables for real and imaginary parts
        var re = 0, im = 0;
        if (complexNumbers.length > i){
            // Remove any leading/trailing whitespace
            var complexNumber = complexNumbers[i].trim();

            // Split the complex number into real and imaginary parts
            var parts = complexNumber.split('+');

            // Iterate over each part
            for (var j = 0; j < parts.length; j++) {
                var part = parts[j].trim();

                // Check if the part contains 'i', if so, it is the imaginary part
                if (part.indexOf('i') !== -1) {
                    im += parseFloat(part.replace('i', ''));
                } else {
                    re += parseFloat(part);
                }
            }
        }

        // Create an object with re and im keys
        var parsedNumber = {
            re: re,
            im: im
        };

        // Add the parsed object to the array
        window.formConfigurations.feeds.push(parsedNumber);
        window.formConfigurations.angles.push(Math.atan2(parsedNumber.im, parsedNumber.re));
    }
}

function updateForm(){
    if ($("#customAntennaSelect").prop('checked')){
        $("#customAntennaField").show();
        $("#numberElements").prop( "disabled", true );
        $("#elementsHorizontalDistance").prop( "disabled", true );

        // Set custom Feeds, no point in trying to set feeds for a non-standard antenna:
        $("#customFeedsSelect").prop("checked",true);
        $("#customFeedsSelect").prop( "disabled", true );

        readCustomAntenna();
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

        readCustomFeeds();
    }else{
        var phaseVar = 2 * pi * $("#elementsHorizontalDistance").val() * Math.sin($("#wavefrontAngle").val() * pi / 180) / $("#waveSpeed").val() * $("#carrierFreq").val();
        $("#phaseVariationByElement").val((phaseVar * 180 / pi).toFixed(4));

        $("#customFeedsField").hide();
        $("#wavefrontAngle").prop( "disabled", false );
        $("#phaseVariationByElement").prop( "disabled", false );

        angleByEl = -$("#phaseVariationByElement").val()/180 * pi;
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

    $("#shareURL").val(parseFormToURL());

    formConfigurations.animationSpeed = parseFloat($("#animSpeed").val());
    formConfigurations.drawElectricField = $("#drawElectricField").prop('checked');
    formConfigurations.drawMagnitude = $("#drawMagnitude").prop('checked');
    formConfigurations.drawSinusoidPeak = $("#drawSinusoidPeaks").prop('checked');
    formConfigurations.drawSinusoidPeakSkips = parseInt($("#sinusoidPeakStep").val());
    formConfigurations.drawWavefronts = $("#drawWaveFronts").prop('checked');
    formConfigurations.drawWavefrontsSkips = parseInt($("#waveFrontStep").val());
    formConfigurations.drawAntennaDiagram = $("#drawAntennaDiagram").prop('checked');
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

    if (fieldsWorkerReady){
        console.log("Sending updateparams to worker")
        var workerCommand = {};
        workerCommand.command = "updateParams"
        workerCommand.ants = formConfigurations.antennas;
        workerCommand.feeds = formConfigurations.feeds;
        workerCommand.startX = simulationState.simulatedWorldStartX;
        workerCommand.startY = simulationState.simulatedWorldStartY;
        workerCommand.antennaCenterX = formConfigurations.antenna_center_x;
        workerCommand.antennaCenterY = formConfigurations.antenna_center_y;
        workerCommand.drawScale = simulationState.DrawScale;
        workerCommand.width = canvas.width;
        workerCommand.height = canvas.height;
        workerCommand.carrierFreq = formConfigurations.carrierFreq;
        workerCommand.waveSpeed = formConfigurations.waveSpeed;
        workerCommand.resolution = formConfigurations.resolution;
        workerCommand.nthreads = formConfigurations.nthreads;
        sendToWorker(workerCommand);
        if (!alreadyProcessing){
            if (formConfigurations.drawMagnitude){
                sendToWorker({command:"getMag"});
                alreadyProcessing = true;
            }
        }else{
            console.log("Worker is busy, send things later");
            pendingProcessing = true;
        }
        sendToWorker({command:"getAntennaDiagram"});
    }else{
        window.pendingStaticsUpdate = true;
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
    }else if(e.data.type == "diagram"){
        window.antennaDiagram = e.data.data.slice();
        window.pendingStaticsUpdate = true;
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
    let delta = performance.now() - lastRender;
    lastRender += delta;
    movingAverageRenderTime = movingAverageRenderTime * 0.97 + delta * 0.03;
    let nextSimulationTime = simulationState.simulationTime + delta * formConfigurations.animationSpeed;

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
    // We only request a new frame when all data 0.00from worker is ready:
    await Promise.all([fieldDrawnPromise, animatedDiagramsPromise]);
    requestAnimationFrame(animate);
}

function drawStaticElements(){

    let canvas = document.getElementById("staticElementsCanvas");
    let context = canvas.getContext("2d");

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#eeeeff";
    context.setLineDash([]);
    context.beginPath();

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
        context
        context.fillText(((formConfigurations.angles[i] * 180 / pi)%360).toFixed(1), sXtoP(ant[0]), sYtoP(ant[1]) + 50);
    }
    context.stroke();
    context.closePath();
    if (formConfigurations.drawAntennaDiagram && window.antennaDiagram.length > 0){
        context.strokeStyle = "#ff44dd";
        context.setLineDash([]);
        context.beginPath();
        context.moveTo(sXtoP(formConfigurations.antenna_center_x) + maxRadius * (window.antennaDiagram[0]/60 + 1), sYtoP(formConfigurations.antenna_center_y));
        var maxRadius = Math.min(canvas.width, canvas.height) * 4 / 5 / 2;
        for (var i = 0; i < window.antennaDiagram.length; i++){
            var angle = 2 * pi / window.antennaDiagram.length * i;
            var radius = maxRadius * (window.antennaDiagram[i]/60 + 1);
            context.lineTo(sXtoP(formConfigurations.antenna_center_x) + radius * Math.cos(angle), sYtoP(formConfigurations.antenna_center_y) + radius * Math.sin(angle));
        }
        context.stroke();
        context.closePath();
        context.strokeStyle = "#808080";
        context.setLineDash([5, 5]);
        context.beginPath();
        context.arc(sXtoP(formConfigurations.antenna_center_x), sYtoP(formConfigurations.antenna_center_y), maxRadius, 0, Math.PI * 2);
        context.moveTo(sXtoP(formConfigurations.antenna_center_x) + maxRadius * (-13/60 + 1), sYtoP(formConfigurations.antenna_center_y));
        context.arc(sXtoP(formConfigurations.antenna_center_x), sYtoP(formConfigurations.antenna_center_y), maxRadius * (-13/60 + 1), 0, Math.PI * 2);
        context.stroke();
        context.closePath();
    }


}

function treatNumber(number){
    if (typeof number === "number"){
        if (number > 1000){
            return number.toExponential(3).padStart(9, " ");
        }else{
            return number.toFixed(3).padStart(9, " ");
        }
    }else{
        return "undefined";
    }
}

async function animateDiagrams(nextTime){
    let canvas = document.getElementById("diagramCanvas");
    let context = canvas.getContext("2d");
    var ratio = window.devicePixelRatio || 1;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = (10 * ratio) + "px monospace";

    var mouseTexts = []
    var mousePromise = 0;
    if (window.printMouseData){
        if (typeof window.mouseStats === "object"){
            mouseTexts = [
                "Mouse position:",
                "x: " + treatNumber(window.mouseStats.x) + ", y: " + treatNumber(window.mouseStats.y) + " (dist: " + treatNumber(window.mouseStats.distance) + ", azimuth: " + (window.mouseStats.azimuth % 360).toFixed(2).padStart(7, " ") + ")",
                "At this position:",
                "Mag: "+ window.mouseStats.magnitude.toFixed(2).padStart(7, " ") + "(" + window.mouseStats.magdb.toFixed(2).padStart(7," ") + " dB), Phase: " + (window.mouseStats.phase % 360).toFixed(2).padStart(7, " "),
                "Electric field: " + window.mouseStats.re.toFixed(2).padStart(7, " ") + ", Magnetic field: " + window.mouseStats.im.toFixed(2).padStart(7, " "),
                "At that azimuth in far range:",
                "Mag: " + window.mouseStats.far_field_mag.toFixed(2).padStart(7, " ") + " (" + window.mouseStats.far_field_magdb.toFixed(2).padStart(7, " ") + " dB)"
            ]


            context.fillStyle = '#000000b0';
            context.fillRect(canvas.width - 640, canvas.height - 8 * 16 * ratio - 8,632, 8*16*ratio + 8)

            context.textBaseline = "bottom";
            context.fillStyle = "#dddddd";
            context.font = (16 * ratio) + "px monospace";
            for (var i = 0; i < mouseTexts.length; i++){
                context.fillText(mouseTexts[i], canvas.width - 16, canvas.height + (i -mouseTexts.length) * 16 * ratio);
            }
        }

        // Now that we used the mouse data, go ahead and requst new one:
        if (fieldsWorkerReady){
            mousePromise = new Promise(function(resolve, reject){
                sendToWorker({command: "getMouse", t: nextTime, mx: PtosX(lastMouseX), my: PtosY(lastMouseY), cx: formConfigurations.antenna_center_x, cy: formConfigurations.antenna_center_y}, resolve);
            });
        }
    }

    context.beginPath();
    // Draw wave peaks
    if (formConfigurations.drawSinusoidPeak){
        var waveLen = formConfigurations.waveSpeed / formConfigurations.carrierFreq;
        var steps = formConfigurations.drawSinusoidPeakSkips;
        var distancePeaks = waveLen * steps;

        var ncircles = 0;
        for (var i = 0; i < formConfigurations.antennas.length; i++) {
            var ant = formConfigurations.antennas[i];
            var elementPhase = simulationState.simulationTime * 2 * pi * formConfigurations.carrierFreq - formConfigurations.angles[i];
            var firstRadius = ((elementPhase / 2 / pi * waveLen) + 10*distancePeaks) % (distancePeaks);

            // If antenna is not visible, we may be able to skip the first circles:
            if ((ant[0] < PtosX(0)) || (ant[0] > PtosX(canvas.width)) || (ant[1] > PtosY(0)) || (ant[1] < PtosY(canvas.height))){
                var minRadius = (Math.max(0, Math.max(PtosX(0) - ant[0], ant[0] - (PtosX(canvas.width)))) ** 2
                  + Math.max(0, Math.max(ant[1] - PtosY(0), -ant[1] + PtosY(canvas.height))) ** 2)**.5;
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
                ncircles++;
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


    // if (window.printMouseData){
    //     for (var i = 0; i < mouseTexts.length; i++){
    //         context.fillText(mouseTexts[i], canvas.width - 16, canvas.height + (i -mouseTexts.length) * 16);
    //     }
    // }

    await mousePromise;

}

function restartWorker(){
    if (window.fieldsWorker instanceof Worker){
        window.fieldsWorker.terminate();
    }
    window.fieldsWorker = 0;
    window.fieldsWorker = new Worker("fieldsWorker.js");
    window.fieldsWorker.onmessage = workerCallback;
    window.fieldsWorker.postMessage({command:"init", filename:window.wasm_filename});
    //window.fieldsWorker.postMessage(["updateParams", window.fieldsModule]);

}

function resizeCanvas() {
    console.log("Resizing canvas");
    const canvasIDs = ["diagramCanvas", "fieldsCanvas", "staticElementsCanvas"];
    canvasIDs.forEach(function(id){
        let canvas = document.getElementById(id);
        var ratio = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * ratio;
        canvas.height = window.innerHeight * ratio;
    });

    updateForm();
}
function autoZoom() {
    // Find the minimum and maximum coordinates
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < formConfigurations.antennas.length; i++) {
        const [x, y, z] = formConfigurations.antennas[i];
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }

    // Calculate the required DrawScale
    let canvas = document.getElementById("diagramCanvas");
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const desiredWidth = canvasWidth * 0.05;
    const desiredHeight = canvasHeight * 0.05;
    const scaleX = desiredWidth / (maxX - minX);
    const scaleY = desiredHeight / (maxY - minY);
    const drawScale = Math.min(scaleX, scaleY);

    // Calculate the new simulatedWorldStartX and simulatedWorldStartY
    const centerX = (maxX + minX) / 2;
    const centerY = (maxY + minY) / 2;
    const simulatedWorldStartX = centerX - (canvasWidth / (2 * drawScale));
    const simulatedWorldStartY = centerY + (canvasHeight / (2 * drawScale));

    // Update the simulationState variables
    simulationState.simulatedWorldStartX = simulatedWorldStartX;
    simulationState.simulatedWorldStartY = simulatedWorldStartY;
    simulationState.DrawScale = drawScale;

    updateForm();
}

function fetchParamsFromURL() {
    const urlParams = new URLSearchParams(window.location.search);

    relevantFormIds.forEach(function(id) {
        if (urlParams.has(id)) {
            const value = urlParams.get(id);
            if (value === "true" || value === "false") {
                $("#" + id).prop('checked', value === "true");
            } else {
                $("#" + id).val(value);
            }
        }
    });
}

function parseFormToURL() {
    let url = window.location.origin + window.location.pathname + "?";

    relevantFormIds.forEach(function(id, index) {
        const value = $("#" + id).prop('type') === 'checkbox' ? $("#" + id).prop('checked') : $("#" + id).val();
        if (value !== "") {
            url += (index > 0 ? "&" : "") + id + "=" + encodeURIComponent(value);
        }
    });

    return url;
}

function copyURLToClipboard(){
   var input = $('#shareURL');
   input.select();
   navigator.clipboard.writeText(input.val());
}


$(function(){
    fetchParamsFromURL();
    $(".triggerFormUpdate").change(function() {updateForm();});
    $("#drawMagnitude").change(function(){
        if ($("#drawMagnitude").prop('checked')){
            $("#drawElectricField").prop('checked', false);;
        }
        updateForm();
    });
    $("#drawElectricField").change(function(){
        if ($("#drawElectricField").prop('checked')){
            $("#drawMagnitude").prop('checked', false);;
        }
        updateForm();
    });
    $("#phaseVariationByElement").change(function(){
        var wavefrontAngle = Math.asin(parseFloat($("#phaseVariationvar ratio = window.devicePixelRatio || 1;ByElement").val())/180 * pi * $("#waveSpeed").val() / parseFloat($("#carrierFreq").val()) / parseFloat($("#elementsHorizontalDistance").val()) / 2 / pi);
        $("#wavefrontAngle").val((wavefrontAngle * 180 / pi).toFixed(4));
        updateForm();
    });
    $("#zoomToFit").click(autoZoom);

    $("#toggleConfigurationWindow").click(function(){$("#configDiv").animate({width:'toggle'},350)});
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, false);

    updateForm();
    requestAnimationFrame(animate);
    autoZoom();
    //
    wasmFeatureDetect.simd().then(function(hasSimd){console.log("SIMD support: " + hasSimd)});
    Promise.all([wasmFeatureDetect.simd(), wasmFeatureDetect.bulkMemory(), wasmFeatureDetect.threads()]).then(function(ret){
        console.log("crossOriginIsolated support(SharedArrayBuffer in postMessage support) : " + crossOriginIsolated);
        console.log("WASM SIMD Support:" + ret[0]);
        console.log("WASM Bulk Memory Support:" + ret[1]);
        console.log("WASM Threads Support:" + ret[2]);

        //var wasm_filename = "compiled_wasm/fields";
        var wasm_filename = "fields";
        if (crossOriginIsolated){var ratio = window.devicePixelRatio || 1;
            wasm_filename += "_sm";
        }
        if (ret[0]){
            wasm_filename += "_simd";
        }
        if (ret[1]){
            // There seems to be a bug in firefox when loading our wasm with all capabilities, so we choose one to remove
            //wasm_filename += "_bm";
        }
        // Threads will only work if we also have shared memories available:
        if (ret[2] && crossOriginIsolated){
            wasm_filename += "_th";
        }
        wasm_filename += ".js";
        window.wasm_filename = wasm_filename;
        restartWorker();

    });

    let canvas = document.getElementById("diagramCanvas");
    canvas.addEventListener('wheel',function(event){
        zoomKeepingPosition(simulationState.DrawScale * Math.pow(1.01, -event.deltaY/10), window.lastMouseX, window.lastMouseY);

        window.pendingStaticsUpdate = true;
        updateForm();
        event.preventDefault();
    }, false);
    canvas.addEventListener('pointermove',function(event){
        var ratio = window.devicePixelRatio || 1;
        window.lastMouseX = event.clientX * ratio;
        window.lastMouseY = event.clientY * ratio;
        let keyList = Object.keys(window.currentPointers);
        var lastDistance = -1;
        if (keyList.length > 1){
            lastDistance = Math.sqrt(
                             Math.pow(window.currentPointers[keyList[0]][0] - window.currentPointers[keyList[1]][0], 2) +
                             Math.pow(window.currentPointers[keyList[0]][1] - window.currentPointers[keyList[1]][1], 2)
                           );
        }
        var lastAverageX = 0;
        var lastAverageY = 0;
        if (keyList.length > 0){
            for (var i = 0; i < keyList.length; i++){
                lastAverageX += window.currentPointers[keyList[i]][0];
                lastAverageY += window.currentPointers[keyList[i]][1];
            }
            lastAverageX /= keyList.length;
            lastAverageY /= keyList.length;
        }
        if (event.pointerId in window.currentPointers){
            window.currentPointers[event.pointerId] = [event.clientX * ratio, event.clientY * ratio];
        }

        if (keyList.length > 0){
            var newAverageX = 0;
            var newAverageY = 0;
            for (var i = 0; i < keyList.length; i++){
                newAverageX += window.currentPointers[keyList[i]][0];
                newAverageY += window.currentPointers[keyList[i]][1];
            }
            newAverageX /= keyList.length;
            newAverageY /= keyList.length;

            window.simulationState.simulatedWorldStartX -= (newAverageX - lastAverageX) / simulationState.DrawScale;
            window.simulationState.simulatedWorldStartY += (newAverageY - lastAverageY) / simulationState.DrawScale;
            window.pendingStaticsUpdate = true;
            window.pendingMouseUpdate = true;
        }
        if (keyList.length > 1){
            var newDistance = Math.sqrt(
                                Math.pow(window.currentPointers[keyList[0]][0] - window.currentPointers[keyList[1]][0], 2) +
                                Math.pow(window.currentPointers[keyList[0]][1] - window.currentPointers[keyList[1]][1], 2)
                              );
            zoomKeepingPosition(newDistance / lastDistance * simulationState.DrawScale, newAverageX, newAverageY);
        }
    }, false);
    canvas.addEventListener('pointerdown',function(event){
        var ratio = window.devicePixelRatio || 1;
        window.lastMouseX = event.clientX * ratio;
        window.lastMouseY = event.clientY * ratio;
        window.currentPointers[event.pointerId] = [event.clientX * ratio, event.clientY * ratio];
    }, false);
    canvas.addEventListener('pointerup',function(event){
        delete window.currentPointers[event.pointerId];
        if (Object.keys(window.currentPointers).length == 0){
            updateForm();
        }
    }, false);

    $(".tooltip").hover(function(){
        $(this).next(".tooltipText").slideDown(100);
    }, function(){
        $(this).next(".tooltipText").slideUp(100);
    });

});
