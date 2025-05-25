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
    await installLocalWheel(pyodide_js, './image_number_extraction-0.1.0-py3-none-any.whl');
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
        helpText.classList.remove('hidden');
        fileInputFeedback.textContent = "Make sure the .zip file contains proper .jpg files.";
        unhighlight();
        dropZone.classList.remove('received');
        dropZone.innerHTML = `<span>.zip file does not contain proper files</span>`;
        extractButtonInput.disabled = true;
        return;
    }
}

async function checkFilesInFS(pyodide_js, dirPath) {
    return pyodide_js.runPythonAsync(`
        import os

        # Specify the path you want to check
        path = '${dirPath}/'

        # List files in the specified directory
        try:
            files = os.listdir(path)
            print("Files in directory:", files)
        except FileNotFoundError:
            print("The specified path does not exist.")
        except Exception as e:
            print("An error occurred:", e)
    `);
}

async function processData(form) {
    if (selectedFiles.length === 0) {
        return;
    }
    // Hide the form
    form.classList.add('hidden');
    // Hide help
    const helpText = document.getElementById('help-text');
    helpText.classList.add('hidden')
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
    
    if (!isMobile && (selectedFiles.length === 1)) {
        handleZipFile(pyodide_js, dirPath);
    }

    // Now you can call a Python function to extract and process the images
    const jsExcelFileName = 'NinjalaTournamentStats.xlsx';
    const excelFileData = await pyodide_js.runPythonAsync(`
        from image_number_extraction.main import create_and_export_single_tournament
        import js

        # Call project entry point of the wheel
        stream = None
        try:
            stream = create_and_export_single_tournament(
                tournament_dir = '/images',
                tournament_name = js.document.getElementById('tournament-name-input').value,
                short_name = js.document.getElementById('tournament-short-name-input').value,
                is_team = js.document.getElementById('toggle-team').checked,
                excel_file_name = "${jsExcelFileName}"
            )
            stream = list(stream)
        except Exception as e:
            print("Error, files are incorrect.", e)
            stream = None
    `);

    // Hide loading indicator
    loadingIndicator.classList.add('hidden');

    if (excelFileData != null) {
        // Create a Blob from the Excel file data
        const blob = new Blob([new Uint8Array(excelFileData)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        // Create a download link
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

function handleFileMobile(files) {
    for (let index = 0; index < files.length; index++) {
        if (files[index].type === 'image/jpeg') {
            selectedFiles.push(files[index]);
        } else {
            fileInputFeedback.textContent = "Only .jpg files are allowed.";
            unhighlight();
            dropZone.classList.remove('received');
            dropZone.innerHTML = `<span>Invalid file type.</span>`;
            extractButtonInput.disabled = true;
            return
        }
    }
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
    dropZone.querySelector("span").textContent = `${selectedFiles.length} files received`
    extractButtonInput.disabled = false;
}

function handleFileDesktop(files) {
    const first_file = files[0];
    if ((first_file.type === 'application/x-zip-compressed') && (first_file.size <= 50000000)) {
        selectedFiles.push(first_file);
        fileInputFeedback.textContent = '';
        unhighlight();
        dropZone.classList.add('received');
        dropZone.innerHTML = `<span>File received: ${first_file.name}</span>`;
        extractButtonInput.disabled = false;
    } else {
        fileInputFeedback.textContent = "Please upload a .zip file.";
        unhighlight();
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
        fileInput.setAttribute('accept', 'image/jpeg');
        fileInput.title = 'Only .jpg files are allowed.';
        dropZoneText.textContent = 'Drop multiple JPEG images here or click to select';
        fileInput.setAttribute('multiple', 'multiple');
    } else {
        fileInput.setAttribute('accept', '.zip');
        fileInput.title = 'Only .zip files a allowed.';
        dropZoneText.textContent = 'Drag & drop .zip file here or click to select';
        fileInput.removeAttribute('multiple');
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
