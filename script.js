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

async function extractZipFiles(pyodide_js) {
    return pyodide_js.runPythonAsync(`
        import zipfile
        import js
        
        # Extract the ZIP file
        accepted_files = 0
        num_non_files = 0
        with zipfile.ZipFile('/uploaded.zip', 'r') as zip_ref:
            zipfile_names = zip_ref.namelist()
            for file_name in zipfile_names:
                if file_name.endswith('/'):
                    num_non_files += 1
                elif file_name.endswith('.jpg'):
                    zip_ref.extract(file_name, '/images')
                    accepted_files += 1
        js.document.getElementById('extractFeedback').textContent = f"{accepted_files} of {len(zipfile_names)-num_non_files} files accepted."
        accepted_files
        `);
}

async function processData(form) {
    if (!selectedFile) {
        return;
    }
    const zipData = await selectedFile.arrayBuffer();

    // Hide the form
    form.classList.add('hidden');

    // Show loading indicator
    const loadingIndicator = document.getElementById('loading');
    loadingIndicator.classList.remove('hidden');

    const pyodide_js = await loadPyodideAndPackages();
    // Write the ZIP file to the Pyodide virtual file system
    pyodide_js.FS.writeFile('/uploaded.zip', new Uint8Array(zipData));

    const accepted_files = await extractZipFiles(pyodide_js);
    if (accepted_files <= 0) {
        document.getElementById('extractFeedback').textContent = '';
        loadingIndicator.classList.add('hidden');
        form.classList.remove('hidden');
        fileInputFeedback.textContent = "Make sure the .zip file contains proper .jpg files.";
        dropZone.classList.remove('highlight');
        dropZone.classList.remove('received');
        dropZone.innerHTML = `<span>.zip file does not contain proper files</span>`;
        extractButtonInput.disabled = true;
        return;
    }

    const jsExcelFileName = 'NinjalaTournamentStats.xlsx';
    // Now you can call a Python function to extract and process the images
    const excelFileData = await pyodide_js.runPythonAsync(`
        from image_number_extraction.main import create_and_export_single_tournament
        import js

        # Call project entry point of the wheel
        stream = create_and_export_single_tournament(
            tournament_dir = '/images',
            tournament_name = js.document.getElementById('tournamentNameInput').value,
            short_name = js.document.getElementById('tournamentShortNameInput').value,
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
    const downloadLink = document.getElementById("downloadLink");
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

function handleFileInput(files) {
    if (files.length > 0) {
        const first_file = files[0];
        selectedFile = first_file;
        if ((first_file.type === 'application/x-zip-compressed') && (first_file.size <= 50000000)) {
            fileInputFeedback.textContent = '';
            dropZone.classList.remove('highlight');
            dropZone.classList.add('received');
            dropZone.innerHTML = `<span>File received: ${first_file.name}</span>`;
            extractButtonInput.disabled = false;
        } else {
            fileInputFeedback.textContent = "Please upload a .zip file.";
            dropZone.classList.remove('highlight');
            dropZone.classList.remove('received');
            dropZone.innerHTML = `<span>Invalid file type. Please upload a .zip file.</span>`;
            extractButtonInput.disabled = true;
        }
    } else {
        fileInputFeedback.textContent = "No file selected.";
        dropZone.classList.remove('received');
        dropZone.innerHTML = `<span>Drag & drop your .zip file here or click to select</span>`;
        extractButtonInput.disabled = true;
    }
}

const tournamentShortNameInput = document.getElementById("tournamentShortNameInput");
const extractButtonInput = document.getElementById("extractButton");
const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById('dropZone');
const fileInputFeedback = document.getElementById('fileInputFeedback');
let selectedFile = null;

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

document.getElementById("createTournamentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    processData(event.target);
});
