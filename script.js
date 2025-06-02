async function loadPyodideAndPackages() {
    const loadingBar = document.getElementById("loading-bar");
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

async function extractZipFile(pyodideJS, dirPath) {
    return await pyodideJS.runPythonAsync(`
        import zipfile
        import js
        
        # Extract the ZIP file
        accepted_files = 0
        num_non_files = 0
        with zipfile.ZipFile('${dirPath}/${selectedFiles[0].name}', 'r') as zip_ref:
            zipfile_names = zip_ref.namelist()
            for file_name in zipfile_names:
                if file_name.endswith('/'):
                    num_non_files += 1
                elif file_name.endswith('.jpg'):
                    zip_ref.extract(file_name, '${dirPath}')
                    accepted_files += 1
        js.document.getElementById('extract-feedback').textContent = f'{accepted_files} of {len(zipfile_names)-num_non_files} files accepted.'
        accepted_files
        `);
}

async function handleZipFile(pyodideJS, dirPath) {
    const accepted_files = await extractZipFile(pyodideJS, dirPath);
    zipfile_received = false;
    
    if (accepted_files <= 0) {
        document.getElementById('extract-feedback').textContent = '';
        loadingIndicator.classList.add('hidden');
        form.classList.remove('hidden');
        helpText.classList.remove('hidden');
        
        selectedFiles = [];
        invalidFileInputUIHandle("Make sure the .zip file contains proper .jpg files.", ".zip file does not contain proper files");
        return;
    }
}

async function processData(form) {
    if (selectedFiles.length === 0) {
        console.log("No selected files.");
        return;
    }
    
    form.classList.add('hidden');
    const helpText = document.getElementById('help-text');
    helpText.classList.add('hidden');
    const loadingIndicator = document.getElementById('loading');
    loadingIndicator.classList.remove('hidden');
    
    extractFeedback.textContent = "Preparing extraction";
    
    const pyodideJS = await loadPyodideAndPackages();

    extractFeedback.textContent = "Preparing images";
    const dirPath = "/images";
    pyodideJS.FS.mkdir(dirPath);
    for (let index = 0; index < selectedFiles.length; index++) {
        try {
            const currentFile = selectedFiles[index];
            const fileData = await currentFile.arrayBuffer();
            pyodideJS.FS.writeFile(`${dirPath}/${currentFile.name}`, new Uint8Array(fileData));
        } catch (error) {
            console.error("Error writing file:", error);
            return;
        }
    }
    if (zipfile_received) {
        try {
            await handleZipFile(pyodideJS, dirPath);
        } catch (error) {
            console.error("Cannot extract and handle files in zip", error);
        }
    }

    extractFeedback.textContent = "Extracting";
    const jsExcelFileName = 'NinjalaTournamentStats.xlsx';
    const excelFileData = await pyodideJS.runPythonAsync(`
        from image_number_extraction.main import create_and_export_single_tournament
        import js

        # Call project entry point of the wheel
        stream = None
        try:
            stream = create_and_export_single_tournament(
                tournament_dir = '${dirPath}',
                tournament_name = js.document.getElementById('tournament-name-input').value,
                short_name = js.document.getElementById('tournament-short-name-input').value,
                is_team = js.document.getElementById('toggle-team').checked,
                excel_file_name = "${jsExcelFileName}"
            )
            stream = list(stream)
        except Exception as e:
            print("Error, files are incorrect.", e)
            stream = None
        stream
    `);

    loadingIndicator.classList.add('hidden');

    if (excelFileData != null) {
        const blob = new Blob([new Uint8Array(excelFileData)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        const downloadLink = document.getElementById("download-link");
        downloadLink.querySelector('a').href = URL.createObjectURL(blob);
        downloadLink.querySelector('a').download = jsExcelFileName;
        downloadLink.classList.remove('hidden');
    } else {
        const errorText = document.createElement("p");
        errorText.textContent = "The files do not meet the criterias. Reload the page and check out the help link.";
        errorText.style.textAlign = "center";
        document.getElementById("content").appendChild(errorText);
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
            invalidFileInputUIHandle("Upload just one file type, .zip or .jpg files.", "Mixed file types.");
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
            zipfile_received = true;
            selectedFiles.push(first_file);
            validFileInputUIHandle();
        }
    }
}

function handleFileInput(files) {
    zipfile_received = false;
    selectedFiles = [];
    
    if (files.length > 0) {
        for (let index = 0; index < files.length; index++) {
            const file = files[index];
            console.log(file.type);
        }
        handleSingleZipFile(files);
        if (!zipfile_received) {
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
        const originalConsoleLog = console.log;
        const consoleOutput = document.getElementById("console-output");
        console.log = function(...args) {
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

let selectedFiles = [];
let zipfile_received = false;
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

window.onclick = function(event) {
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
    processData(event.target);
});
