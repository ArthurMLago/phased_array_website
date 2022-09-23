
var simulatedWorldStartX = -0.1;
var simulatedWorldStartY = -.5;
var DrawScale = 700;

var simulationTime = 0;
const pi = 3.14159;

var lastRender = Date.now();

var antennaList = [[0.5, 0.5, 0], [0.6, 0.5, 0], [0.7, 0.5, 0]];
var feedsList = [0*pi/180,50*pi/180,180 * pi / 180];
var anglesList = [];

var pendingStaticsUpdate = true;

function sXtoP(posX){
    return (posX - simulatedWorldStartX) * DrawScale
}

function PtosX(pX){
    return pX/DrawScale + simulatedWorldStartX;
}

function sYtoP(posY){
    return (posY - simulatedWorldStartY) * DrawScale
}

function PtosY(pY){
    return pY/DrawScale + simulatedWorldStartY;
}

function updatePhaseVariation(){
    var phaseVar = 2 * pi * $("#elementsHorizontalDistance").val() * Math.sin($("#wavefrontAngle").val() * pi / 180) / $("#waveSpeed").val() * $("#carrierFreq").val();
    $("#phaseVariationByElement").val(phaseVar * 180 / pi);
    updateForm();
}

function updateWaveFrontAngle(){
    var wavefrontAngle = Math.asin($("#phaseVariationByElement").val()/180 * pi * $("#waveSpeed").val() / $("#carrierFreq").val() / $("#elementsHorizontalDistance").val() / 2 / pi);
    $("#wavefrontAngle").val(wavefrontAngle * 180 / pi);
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
        window.antennaList = [];
        for (i = 0; i < $("#numberElements").val(); i++){
            posX = elementDistance * i;
            window.antennaList.push([posX, 0, 0])
            textAreaText += "(" + posX + ",0,0),"
        }
        $("#customAntennaField").val(textAreaText);
    }

    if ($("#customFeedsSelect").prop('checked')){
        $("#customFeedsField").show();
        $("#wavefrontAngle").prop( "disabled", true );
        $("#phaseVariationByElement").prop( "disabled", true );
    }else{
        $("#customFeedsField").hide();
        $("#wavefrontAngle").prop( "disabled", false );
        $("#phaseVariationByElement").prop( "disabled", false );


        angleByEl = $("#phaseVariationByElement").val()/180 * pi;
        textAreaText = "";
        window.feedsList = []
        window.anglesList = [];
        for (i = 0; i < $("#numberElements").val(); i++){
            angle = angleByEl * i;
            f = math.exp(math.multiply(math.complex(0,1), angle * i));
            textAreaText += f.toString() + ", ";
            window.feedsList.push(f);
            window.anglesList.push(angle);
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

    pendingStaticsUpdate = true;
}

function animate(){
    let delta = Date.now() - lastRender;

    simulationTime += delta/1000 /3e9

    if (pendingStaticsUpdate){
        drawStaticElements();
    }

    animateDiagrams();
    drawFields()

    pendingStaticsUpdate = false;

    lastRender += delta;

    requestAnimationFrame(animate);
}

function drawStaticElements(){

    let canvas = document.getElementById("staticElementsCanvas");
    let context = canvas.getContext("2d");

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.beginPath();

    for (var i = 0; i < antennaList.length; i++) {
        const ant = antennaList[i];
        context.moveTo(sXtoP(ant[0]), sYtoP(ant[1]));
        context.lineTo(sXtoP(ant[0]), sYtoP(ant[1]) - 30);
        context.moveTo(sXtoP(ant[0]), sYtoP(ant[1]) - 15);
        context.lineTo(sXtoP(ant[0]) + 15, sYtoP(ant[1]) - 30);
        context.moveTo(sXtoP(ant[0]), sYtoP(ant[1]) - 15);
        context.lineTo(sXtoP(ant[0]) - 15, sYtoP(ant[1]) - 30);

        context.rect(sXtoP(ant[0]) - 15, sYtoP(ant[1]), 30, 30);

        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = "orange";
        context.fillText(((anglesList[i] * 180 / pi)%360).toFixed(1), sXtoP(ant[0]), sYtoP(ant[1]) + 20);
    }
    context.stroke();
}

function animateDiagrams(){

    let canvas = document.getElementById("diagramCanvas");
    let context = canvas.getContext("2d");

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.beginPath();

    // Draw wave peaks
    var waveLen = $("#waveSpeed").val() / $("#carrierFreq").val();
    var steps = $("#sinusoidPeakStep").val();
    var distancePeaks = waveLen * steps;
    for (var i = 0; i < antennaList.length; i++) {
        var ant = antennaList[i];
        var elementPhase = simulationTime * 2 * pi * $("#carrierFreq").val() - anglesList[i];
        var firstRadius = ((elementPhase / 2 / pi * waveLen) + 10*distancePeaks) % (distancePeaks);

        var maxRadius = Math.max(
            (PtosX(0) - ant[0]) * (PtosX(0) - ant[0]) + (PtosY(0) - ant[1]) * (PtosY(0) - ant[1]),
            (PtosX(0) - ant[0]) * (PtosX(0) - ant[0]) + (PtosY(canvas.height) - ant[1]) * (PtosY(canvas.height) - ant[1]),
            (PtosX(canvas.width) - ant[0]) * (PtosX(canvas.width) - ant[0]) + (PtosY(canvas.height) - ant[1]) * (PtosY(canvas.height) - ant[1]),
            (PtosX(canvas.width) - ant[0]) * (PtosX(canvas.width) - ant[0]) + (PtosY(0) - ant[1]) * (PtosY(0) - ant[1])
        );
        var j = 0;
        while(firstRadius + j * distancePeaks < maxRadius){
            context.moveTo(sXtoP(ant[0] + firstRadius + j * distancePeaks), sYtoP(ant[1]) - 30);
            context.arc(sXtoP(ant[0]), sYtoP(ant[1]) - 30, (firstRadius + j * distancePeaks) * DrawScale, 0, 2*pi, false);
           j++;
        }
    }
    context.stroke();
}

$(document).ready(function(){
    $("#customAntennaSelect").change(function() {
        updateForm();
    });
    $("#customFeedsSelect").change(function() {
        updateForm();
    });
    $("#drawSinusoidPeaks").change(function() {
        updateForm();
    });
    $("#drawWaveFronts").change(function() {
        updateForm();
    });
    $("#numberElements").change(updateForm);
    $("#elementsHorizontalDistance").change(updateForm);

    $("#phaseVariationByElement").change(updateWaveFrontAngle);
    $("#wavefrontAngle").change(updatePhaseVariation);


    updateForm();
    animate();
});
