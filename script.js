async function loadPyodideAndPackages() {
    const pyodideJS = await loadPyodide();

    loadingBar.style.width = "33.33%";
    await pyodideJS.loadPackage("micropip");

    loadingBar.style.width = "66.66%";
    const wheelFileName = 'image_number_extraction-0.1.0-py3-none-any.whl';
    const wheelUrl = new URL(wheelFileName, window.location.href).href;

    await pyodideJS.runPythonAsync(`
        import micropip
        await micropip.install("${wheelUrl}")
    `);
    loadingBar.style.width = "100%";
    loadingBar.classList.add("hidden");
    return pyodideJS;
}

function restoreFormUI(form) {
    extractFeedback.textContent = '';
    loadingIndicator.classList.add('hidden');
    form.classList.remove('hidden');
    helpText.classList.remove('hidden');
}

function transitionToLoadingUI(form) {
    form.classList.add('hidden');
    helpText.classList.add('hidden');
    loadingIndicator.classList.remove('hidden');
}

let callExtractApiPythonCode = `
from image_number_extraction.main import create_tournament_from_stream
from image_number_extraction.main import export_as_excel_stream

def call_extract_api():
    from js import apiParams

    def convert_to_bytes(image_bytestring):
        return bytes(image_bytestring)

    image_bytestrings = list(map(convert_to_bytes, apiParams.imageBytestrings))

    stream = None
    try:
        tournament = create_tournament_from_stream(
            image_bytestrings = image_bytestrings,
            tournament_name = apiParams.tournamentName,
            is_team = apiParams.isTeam,
            debug = apiParams.debug
        )
        stream = export_as_excel_stream(tournaments = [tournament], excel_file_name = apiParams.excelFileName)
        stream = list(stream)
    except Exception as e:
        print("Error, files are incorrect.", e)
        stream = None
    
    return tournament.get_summary(), stream
`;

function transitionToErrorUI() {
    loadingIndicator.classList.add('hidden');
    const errorText = document.createElement("p");
    errorText.textContent = "The files do not meet the criterias. Make sure, to NOT use the Nintendo Switch App to transfer the images. Reload the page and check out the help link for more.";
    errorText.style.textAlign = "center";
    document.getElementById("content").appendChild(errorText);
}

function transitionToPyodideErrorUI() {
    transitionToErrorUI();
    const paragraph = document.querySelector('div#content p');
    paragraph.textContent = "Sorry something went wrong preparing the extraction. Reload the page, check out the help link and contact the owner."
}

async function processData(form) {
    if (selectedFiles.length === 0) {
        console.log("No selected files.");
        return;
    }

    transitionToLoadingUI(form);

    extractFeedback.textContent = "Preparing extraction";
    let pyodideJS = null;
    try {
        pyodideJS = await loadPyodideAndPackages();
    } catch (error) {
        console.error("Cannot load pyodide:", error);
        transitionToPyodideErrorUI();
        return;
    }

    extractFeedback.textContent = "Preparing images";
    let imageBytestrings = [];

    if (zipfileReceived) {
        const zip = new JSZip();
        try {
            const unzipped = await zip.loadAsync(selectedFiles[0]);
            for (const fileName in unzipped.files) {
                if (unzipped.files[fileName].name.match(/\.(jpg|jpeg)$/)) {
                    const imageData = await unzipped.files[fileName].async("uint8array");
                    imageBytestrings.push(Array.from(imageData));
                }
            }
        } catch (error) {
            console.error("Cannot handle files in zip: ", error);
            transitionToErrorUI();
            return;
        }
    } else {
        for (let index = 0; index < selectedFiles.length; index++) {
            const currentFile = selectedFiles[index];
            try {
                const arrayBuffer = await currentFile.arrayBuffer();
                imageBytestrings.push(Array.from(new Uint8Array(arrayBuffer)));
            } catch (error) {
                console.error("Error writing file:", error);
                transitionToErrorUI();
                return;
            }
        }
    }

    extractFeedback.textContent = "Extracting";
    const jsExcelFileName = 'NinjalaTournamentStats.xlsx';
    var apiReturn = null;
    var tournamentSummary = null;
    var excelFileData = null;

    // parameters for api call
    const apiParams = {
        imageBytestrings: imageBytestrings,
        tournamentName: document.getElementById('tournament-name-input').value,
        isTeam: document.getElementById('toggle-team').checked,
        excelFileName: jsExcelFileName,
        debug: debugMode
    };
    window.apiParams = apiParams;

    await pyodideJS.runPythonAsync(callExtractApiPythonCode);
    let pythonApiCall = `call_extract_api()`;

    try {
        apiReturn = await pyodideJS.runPythonAsync(pythonApiCall);
        tournamentSummary = apiReturn[0];
        excelFileData = apiReturn[1];
    } catch (error) {
        console.error("Cannot extract number of files: ", error)
        transitionToErrorUI();
        return;
    }

    if (tournamentSummary != null) {
        let jsTournamentSummary = tournamentSummary.toJs();
        createWebStats(jsTournamentSummary);
    }

    if (excelFileData != null) {
        let jsExcelFileData = excelFileData.toJs();
        const blob = new Blob([new Uint8Array(jsExcelFileData)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        excelFileData.destroy();

        loadingIndicator.classList.add('hidden');
        downloadLink.querySelector('a').href = URL.createObjectURL(blob);
        downloadLink.querySelector('a').download = jsExcelFileName;
        downloadLink.classList.remove('hidden');
    } else {
        transitionToErrorUI();
        return;
    }
}

function createWebStats(jsTournamentSummary) {
    document.getElementById("main-header").classList.add('hidden');
    document.getElementById("stat-title").textContent = jsTournamentSummary.get('Tournament Name');
    const spans = [
        "total-points-span",
        "played-games-span",
        "avg-points-span",
        "highest-gain-span",
        "highest-loss-span",
        "avg-ippons-span",
        "avg-drones-span",
        "avg-kos-span"
    ];

    const keys = [
        'Total Points',
        'Played Games',
        'Average Points',
        'Largest Gain',
        'Largest Loss',
        'Average IPPONs',
        'Average Drones',
        'Average KOs'
    ];

    spans.forEach((spanId, index) => {
        document.getElementById(spanId).textContent = jsTournamentSummary.get(keys[index]);
    });
    let winRateSpan = jsTournamentSummary.get('Win Rate');
    document.getElementById("win-rate-span").textContent = `${winRateSpan[0]} - ${winRateSpan[1]}`;

    const ctx = document.getElementById('myChart').getContext('2d');

    const chartAreaBorder = {
        id: 'chartAreaBorder',
        afterDatasetsDraw(chart, args, options) {
            const { ctx, chartArea: { top, bottom, left, right, width, height } } = chart;
            ctx.save()
            ctx.strokeRect(left, top, width - 1, height);
            ctx.restore();
        }
    };

    const myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({ length: 42 }, (_, index) => index),
            datasets: [{
                label: 'Points',
                data: jsTournamentSummary.get('Current Points'),
                borderColor: 'rgb(0, 123, 255)',
                pointBackgroundColor: 'rgb(0, 123, 255)',
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: function (tooltipItems) {
                            const xValue = tooltipItems[0].label;
                            return `Game ${xValue}`;
                        },
                        footer: function (tooltipItems) {
                            const index = tooltipItems[0].dataIndex;
                            const pointsList = [''].concat(jsTournamentSummary.get('Points'));
                            return [`Gains: ${pointsList[index]}`];
                        }
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: "Game" } },
                y: { title: { display: true, text: "Points" } }
            }
        },
        plugins: [chartAreaBorder]
    });
}

function validFileInputUIHandle() {
    fileInputFeedback.textContent = '';
    dropZone.innerHTML = '<span></span>';
    unhighlight();
    dropZone.classList.add('received');
    dropZone.innerHTML = dropZone.innerHTML.concat(`<ul class="selected-files-list"></ul>`);
    let dropZoneUl = dropZone.querySelector("ul");
    for (let index = 0; index < selectedFiles.length; index++) {
        let liElement = document.createElement("li");
        liElement.textContent = `${selectedFiles[index].name}`;
        dropZoneUl.appendChild(liElement);
    }
    dropZone.querySelector("span").textContent = `${selectedFiles.length} files received`;
    extractButtonInput.disabled = false;
}

function invalidFileInputUIHandle(feedback, dropZoneSpanMessage) {
    fileInputFeedback.textContent = feedback;
    unhighlight();
    dropZone.classList.remove('received');
    dropZone.innerHTML = `<span>${dropZoneSpanMessage}</span>`;
    extractButtonInput.disabled = true;
}

function handleJpegFiles(files) {
    for (let index = 0; index < files.length; index++) {
        if (files[index].type === 'image/jpeg') {
            selectedFiles.push(files[index]);
        } else {
            selectedFiles = [];
            invalidFileInputUIHandle("Upload just one file type, .zip with .jpg files or just .jpg files.", "Mixed file types.");
            return;
        }
    }
    validFileInputUIHandle();
}

function handleSingleZipFile(files) {
    if (files.length === 1) {
        const first_file = files[0];
        const isZip = ((first_file.type === 'application/zip') || (first_file.type === 'application/x-zip-compressed')) && (first_file.size <= 50000000);
        if (isZip) {
            zipfileReceived = true;
            selectedFiles.push(first_file);
            validFileInputUIHandle();
        }
    }
}

function handleFileInput(files) {
    zipfileReceived = false;
    selectedFiles = [];

    if (files.length > 0) {
        for (let index = 0; index < files.length; index++) {
            const file = files[index];
            console.log(file.type);
        }
        handleSingleZipFile(files);
        if (!zipfileReceived) {
            handleJpegFiles(files);
        }
    } else {
        selectedFiles = [];
        invalidFileInputUIHandle("No file selected.", "Drag & drop files here or click to select");
    }
}

function checkDebugMode() {
    const urlParameters = new URLSearchParams(window.location.search);
    debugMode = urlParameters.has("debug");
    if (debugMode) {
        debugConsoleContainer.classList.remove("hidden");
        const consoleOutput = document.getElementById("console-output");

        const originalConsoleLog = console.log;
        console.log = function (...args) {
            consoleOutput.textContent += args + "\n";
            originalConsoleLog.apply(console, args);
        };

        const originalConsoleError = console.error;
        console.error = function (...args) {
            consoleOutput.textContent += args + "\n";
            originalConsoleLog.apply(console, args);
        };

        console.log("debug mode active.");
    }
}

const extractButtonInput = document.getElementById("extract-button");
const fileInput = document.getElementById("file-input");
const dropZone = document.getElementById('drop-zone');
const dropZoneText = document.getElementById('drop-zone-text');
const fileInputFeedback = document.getElementById('file-input-feedback');
const extractFeedback = document.getElementById('extract-feedback');
const debugConsoleContainer = document.getElementById('console-container');
const helpText = document.getElementById('help-text');
const loadingIndicator = document.getElementById('loading');
const loadingBar = document.getElementById("loading-bar");
const downloadLink = document.getElementById("download-link");

let selectedFiles = [];
let zipfileReceived = false;
let debugMode = false;

if (document.readyState === "loading") {
    checkDebugMode();
    console.log(window.navigator.userAgent);
}

fileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    handleFileInput(files);
});

// Prevent default drag behaviors
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
});

// Highlight drop area when item is dragged over it
['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, highlight, false);
});

// Remove highlight when item is no longer hovering
['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, unhighlight, false);
});

// Handle dropped files
dropZone.addEventListener('drop', handleDrop, false);
dropZone.addEventListener('click', () => fileInput.click(), false);

// Prevent default behavior (Prevent file from being opened)
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// Highlight the drop zone
function highlight() {
    dropZone.classList.add('highlight');
}

// Remove highlight from the drop zone
function unhighlight() {
    dropZone.classList.remove('highlight');
}

// Handle dropped files
function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;

    handleFileInput(files);
    unhighlight();
}

document.getElementById('help-text').addEventListener('click', function () {
    document.getElementById('help-popup').style.display = 'block';
});

document.getElementById('close-popup').addEventListener('click', function () {
    closePopup();
});

window.addEventListener('click', handleClosePopup);
window.addEventListener('touchstart', handleClosePopup);

function handleClosePopup(event) {
    const popup = document.getElementById('help-popup');

    if (event.target === popup) {
        closePopup();
    }
}

function closePopup() {
    document.getElementById('help-popup').style.display = 'none';
}

document.getElementById("create-tournament-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await processData(event.target);
});
