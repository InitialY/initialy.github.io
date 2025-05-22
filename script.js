async function installLocalWheel(pyodide_js, wheelPath) {
    await pyodide_js.runPythonAsync(`
            import micropip
            await micropip.install('${wheelPath}', keep_going=True)
        `);
}

// Load Pyodide 
async function loadPyodideAndPackages() {
    let pyodide_js = await loadPyodide();
    await pyodide_js.loadPackage("micropip");
    await installLocalWheel(pyodide_js, 'http://localhost:5500/image_number_extraction-0.1.0-py3-none-any.whl');
    return pyodide_js;
}

async function extractZipFile(pyodide_js, dirPath) {
    return pyodide_js.runPythonAsync(`
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
                    zip_ref.extract(file_name, '/images')
                    accepted_files += 1
        js.document.getElementById('extract-feedback').textContent = f"{accepted_files} of {len(zipfile_names)-num_non_files} files accepted."
        accepted_files
        `);
}

function handleZipFile(pyodide_js, dirPath) {
    const accepted_files = extractZipFile(pyodide_js, dirPath);
    
    if (accepted_files <= 0) {
        document.getElementById('extract-feedback').textContent = '';
        loadingIndicator.classList.add('hidden');
        form.classList.remove('hidden');
        aboutText.classList.remove('hidden');
        fileInputFeedback.textContent = "Make sure the .zip file contains proper .jpg files.";
        dropZone.classList.remove('highlight');
        dropZone.classList.remove('received');
        dropZone.innerHTML = `<span>.zip file does not contain proper files</span>`;
        extractButtonInput.disabled = true;
        return;
    }
}

async function processData(form) {
    if (selectedFiles.length === 0) {
        return;
    }
    // Hide the form
    form.classList.add('hidden');
    // Hide about
    const aboutText = document.getElementById('about-text');
    aboutText.classList.add('hidden')
    // Show loading indicator
    const loadingIndicator = document.getElementById('loading');
    loadingIndicator.classList.remove('hidden');
    
    const pyodide_js = await loadPyodideAndPackages();
    
    // create directory for images
    const dirPath = "/images"
    pyodide_js.FS.mkdir(dirPath);

    // write files into pyodide virtual file system
    for (let index = 0; index < selectedFiles.length; index++) {
        try {
            const currentFile = selectedFiles[index];
            const fileData = await currentFile.arrayBuffer();
            pyodide_js.FS.writeFile(`${dirPath}/${currentFile.name}`, new Uint8Array(fileData))    
        } catch (error) {
            console.error("Error writing file:", error);
        }
    }
    
    // const zipData = await selectedFiles.arrayBuffer();
    // Write the ZIP file to the Pyodide virtual file system
    // pyodide_js.FS.writeFile('/uploaded.zip', new Uint8Array(zipData));
    
    if (!isMobile && (selectedFiles.length === 1)) {
        handleZipFile(pyodide_js, dirPath);
    }
    
    // Now you can call a Python function to extract and process the images
    const jsExcelFileName = 'NinjalaTournamentStats.xlsx';
    const excelFileData = await pyodide_js.runPythonAsync(`
        from image_number_extraction.main import create_and_export_single_tournament
        import js

        # Call project entry point of the wheel
        stream = create_and_export_single_tournament(
            tournament_dir = '/images',
            tournament_name = js.document.getElementById('tournament-name-input').value,
            short_name = js.document.getElementById('tournament-short-name-input').value,
            is_team = js.document.getElementById('toggle-team').checked,
            excel_file_name = "${jsExcelFileName}"
        )
        list(stream)
    `);

    // Create a Blob from the Excel file data
    const blob = new Blob([new Uint8Array(excelFileData)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    // Hide loading indicator
    loadingIndicator.classList.add('hidden');

    // Create a download link
    const downloadLink = document.getElementById("download-link");
    downloadLink.querySelector('a').href = URL.createObjectURL(blob);
    downloadLink.querySelector('a').download = jsExcelFileName;
    downloadLink.classList.remove('hidden');
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

function handleFileMobile(files) {
    for (let index = 0; index < files.length; index++) {
        if (files[index].type === 'image/jpeg') {
            selectedFiles.push(files[index]);
        } else {
            fileInputFeedback.textContent = "Only .jpg files are allowed.";
            dropZone.classList.remove('highlight');
            dropZone.classList.remove('received');
            dropZone.innerHTML = `<span>Invalid file type.</span>`;
            extractButtonInput.disabled = true;
            return
        }
    }
    fileInputFeedback.textContent = '';
    unhighlight();
    dropZone.classList.add('received');
    for (let index = 0; index < selectedFiles.length; index++) {
        dropZone.innerHTML = dropZone.innerHTML.concat(`<li>${selectedFiles[index].name}</li>`);
    }
    extractButtonInput.disabled = false;
}

function handleFileDesktop(files) {
    const first_file = files[0];
    if ((first_file.type === 'application/x-zip-compressed') && (first_file.size <= 50000000)) {
        selectedFiles.push(first_file);
        fileInputFeedback.textContent = '';
        dropZone.classList.remove('highlight');
        dropZone.classList.add('received');
        dropZone.innerHTML = `<span>File received: ${first_file.name}</span>`;
        extractButtonInput.disabled = false;
    } else {
        fileInputFeedback.textContent = "Please upload a .zip file.";
        dropZone.classList.remove('highlight');
        dropZone.classList.remove('received');
        dropZone.innerHTML = `<span>Invalid file type.</span>`;
        extractButtonInput.disabled = true;
    }
}

function handleFileInput(files) {
    if (files.length > 0) {
        if (isMobile) {
            handleFileMobile(files);
        } else {
            handleFileDesktop(files);
        }
    } else {
        fileInputFeedback.textContent = "No file selected.";
        dropZone.classList.remove('received');
        dropZone.innerHTML = `<span>Drag & drop files here or click to select</span>`;
        extractButtonInput.disabled = true;
    }
}


function setupDropZone(){
    if (isMobile) {
        fileInput.setAttribute('accept', 'images/jpeg');
        dropZoneText.textContent = 'Drop multiple JPEG images here or click to select';
        fileInput.multiple = true;
    } else {
        fileInput.setAttribute('accept', '.zip');
        dropZoneText.textContent = 'Drag & drop .zip file here or click to select';
        fileInput.multiple = false;
    }

}

const tournamentShortNameInput = document.getElementById("tournament-short-name-input");
const extractButtonInput = document.getElementById("extract-button");
const fileInput = document.getElementById("file-input");
const dropZone = document.getElementById('drop-zone');
const dropZoneText = document.getElementById('drop-zone-text');
const fileInputFeedback = document.getElementById('file-input-feedback');
const isMobile = window.navigator.userAgent.indexOf("Mobile") != -1;
let selectedFiles = [];

if (document.readyState === "loading") {
    setupDropZone();
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

document.getElementById('about-text').addEventListener('click', function() {
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('about-tab').style.display = 'block';
});


document.getElementById('close-tab').addEventListener('click', function() {
    closeTab();
});

document.getElementById('overlay').addEventListener('click', function() {
    closeTab();
});

function closeTab() {
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('about-tab').style.display = 'none';
}

document.getElementById("create-tournament-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    processData(event.target);
});
