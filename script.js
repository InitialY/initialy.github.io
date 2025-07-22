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

async function extractZipFile(pyodideJS) {
    return await pyodideJS.runPythonAsync(`
        import zipfile
        
        # Extract the ZIP file
        filenames = []
        accepted_files = 0
        num_non_files = 0
        with zipfile.ZipFile('${selectedFiles[0].name}', 'r') as zip_file:
            for file_info in zip_file.infolist():
                curr_filename = file_info.filename
                if curr_filename.endswith('.jpg'):
                    accepted_files += 1
                    filenames.append(curr_filename)
                    with zip_file.open(file_info) as file:
                        bytestrings.append(file.read())
                else:
                    num_non_files += 1
        filenames, bytestrings, accepted_files, len(filenames)-num_non_files
    `);
}

async function handleZipFile(pyodideJS, form) {
    let extractReturnValues = await extractZipFile(pyodideJS);
    selectedFiles = [...extractReturnValues[0]];
    let byteStrings = extractReturnValues[1];
    extractFeedback.textContent = `${extractReturnValues[2]} of ${extractReturnValues[3]} files accepted.`;
    zipfileReceived = false;
    
    if (extractReturnValues[2] <= 0) {
        restoreFormUI(form);
        
        selectedFiles = [];
        invalidFileInputUIHandle("Make sure the .zip file contains proper .jpg files.", ".zip file does not contain proper files");
        return;
    }
    return byteStrings;
}

function transitionToLoadingUI(form) {
    form.classList.add('hidden');
    helpText.classList.add('hidden');
    loadingIndicator.classList.remove('hidden');
}

let callExtractApiPythonCode = `
from image_number_extraction.main import create_and_export_single_tournament_as_stream

def call_extract_api(image_filenames, bytestrings, tournament_name, short_name, total_points, is_team, excel_file_name):
    stream = None
    try:
        stream = create_and_export_single_tournament_as_stream(
            filenames = image_filenames,
            bytestrings = bytestrings,
            tournament_name = tournament_name,
            short_name = short_name,
            total_points = total_points,
            is_team = is_team,
            excel_file_name = excel_file_name
        )
        stream = list(stream)
    except Exception as e:
        print("Error, files are incorrect.", e)
        stream = None
    return stream
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
    const byteStrings = [];

    if (zipfileReceived) {
        try {
            byteStrings = await handleZipFile(pyodideJS, form);
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
                byteStrings.push(new Uint8Array(arrayBuffer));
            } catch (error) {
                console.error("Error writing file:", error);
                transitionToErrorUI();
                return;
            }
        }
    }
    
    extractFeedback.textContent = "Extracting";
    const jsExcelFileName = 'NinjalaTournamentStats.xlsx';
    var excelFileData = null;
    await pyodideJS.runPythonAsync(callExtractApiPythonCode);
    // parameters for api call
    const byteStringsConverted = byteStrings.map(uint8Array => Array.from(uint8Array));
    const imageFilenames = selectedFiles.map(file => file.name);
    const tournamentName = document.getElementById('tournament-name-input').value;
    const shortName = document.getElementById('tournament-short-name-input').value;
    const totalPoints = 500;
    const isTeam = document.getElementById('toggle-team').checked;

    let byteStringsConvertedString = JSON.stringify(byteStringsConverted);
    let imageFilenamesString = JSON.stringify(imageFilenames);
    let pythonApiCall = `call_extract_api(${imageFilenamesString}, ${byteStringsConvertedString}, ${tournamentName}, ${shortName}, ${totalPoints}, ${isTeam}, ${jsExcelFileName})`;

    try {
        excelFileData = await pyodideJS.runPythonAsync(pythonApiCall);
    } catch (error) {
        console.error("Cannot extract number of files: ", error)
        transitionToErrorUI();
        return;
    }

    if (excelFileData != null) {
        const blob = new Blob([new Uint8Array(excelFileData)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        loadingIndicator.classList.add('hidden');
        downloadLink.querySelector('a').href = URL.createObjectURL(blob);
        downloadLink.querySelector('a').download = jsExcelFileName;
        downloadLink.classList.remove('hidden');
    } else {
        transitionToErrorUI();
        return;
    }
}

function validateInput(input) {
    if (input.validity.valid) {
        input.classList.remove('invalid');
        input.nextElementSibling.textContent = '';
    } else {
        input.classList.add('invalid');
        input.nextElementSibling.textContent = input.title;
    }
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
        console.log = function(...args) {
            consoleOutput.textContent += args + "\n";
            originalConsoleLog.apply(console, args);
        };

        const originalConsoleError = console.error;
        console.error = function(...args) {
            consoleOutput.textContent += args + "\n";
            originalConsoleLog.apply(console, args);
        };

        console.log("debug mode active.");
    }
}

const tournamentShortNameInput = document.getElementById("tournament-short-name-input");
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

tournamentShortNameInput.addEventListener('input', () => validateInput(tournamentShortNameInput));
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

document.getElementById('help-text').addEventListener('click', function() {
    document.getElementById('help-popup').style.display = 'block';
});

document.getElementById('close-popup').addEventListener('click', function() {
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
