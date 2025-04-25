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

// Validate input for tournament short name
function validateTournamentShortNameInput() {
    const tournamentShortName = document.getElementById('tournamentShortNameInput').value;
    const tournamentShortNameMessage = document.getElementById('tournamentShortNameInputFeedback');
    // Regular expression to allow only letters (both uppercase and lowercase)
    const regex = /^[A-Za-z]+$/;
    if (!regex.test(tournamentShortName)) {
        tournamentShortNameMessage.textContent = 'Invalid short name! Only letters are allowed.';
        tournamentShortNameMessage.style.color = 'red';
    }
}

// Validate input for total points
function validateTotalPointsInput() {
    const totalPoints = document.getElementById('totalPointsInput').value;
    const totalPointsMessage = document.getElementById('totalPointsInputFeedback');
    if (totalPoints < 0 || totalPoints > 1400) {
        totalPointsMessage.textContent = 'Invalid total points! Points should within 0 and 1400.';
        totalPointsMessage.style.color = 'red'
    }
}

// Validate file input
function validateFileInput() {
    const fileInput = document.getElementById('fileInput');
    const fileInputMessage = document.getElementById('fileInputFeedback');
    if (fileInput?.files.length > 0) {
        const file = fileInput.files[0];
        const fileExtension = file.name.split('.').pop().toLowerCase();
        const fileType = file.type;
        if (fileExtension === 'zip' || fileType === 'application/zip' || fileType === 'application/x-zip-compressed') {
            return file;
        } else {
            fileInputMessage.textContent = 'The selected file is not a zip file.';
            fileInputMessage.style.color = 'red';
            return;
        }
    } else {
        fileInputMessage.textContent = 'No file selected.';
        fileInputMessage.style.color = 'red';
        return;
    }
}

async function handleFileUpload() {
    // Validation
    validateTournamentShortNameInput();
    validateTotalPointsInput();
    const file = validateFileInput();

    if (!file){
        return;
    }

    // Show loading indicator
    const loadingIndicator = document.getElementById('loading');
    loadingIndicator.classList.remove('hidden');

    const pyodide_js = await loadPyodideAndPackages();
    const zipData = await file.arrayBuffer();

    // Write the ZIP file to the Pyodide virtual file system
    pyodide_js.FS.writeFile('/uploaded.zip', new Uint8Array(zipData));

    const jsExcelFileName = 'NinjalaTournamentStats.xlsx';
    // Now you can call a Python function to extract and process the images
    const excelFileData = await pyodide_js.runPythonAsync(`
        import zipfile
        import os
        from image_number_extraction.main import create_and_export_single_tournament
        import io
        import js

        # Extract the ZIP file
        zipfile_names = []
        with zipfile.ZipFile('/uploaded.zip', 'r') as zip_ref:
            zip_ref.extractall('/images')
            zipfile_names.extend(zip_ref.namelist())
        
        zipfile_path = os.path.join('/images', zipfile_names[0])
        
        # Call project entry point of the wheel
        stream = create_and_export_single_tournament(
            tournament_dir = zipfile_path,
            tournament_name = js.document.getElementById('tournamentNameInput').value,
            short_name = js.document.getElementById('tournamentShortNameInput').value,
            total_points = js.document.getElementById('totalPointsInput').value,
            is_team = js.document.getElementById('isTeamInput').checked,
            excel_file_name = "${jsExcelFileName}"
        )
        list(stream)
    `);
    // Hide loading indicator
    loadingIndicator.classList.add('hidden');
    
    // Create a Blob from the Excel file data
    const blob = new Blob([new Uint8Array(excelFileData)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    const downloadLink = document.getElementById("downloadLink");
    downloadLink.classList.remove('hidden');
    
    // Create a download link
    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = jsExcelFileName;
    downloadLink.style.display = 'block'; // Show the link
    downloadLink.innerText = 'Download Excel File';
}

document.getElementById("uploadButton").addEventListener("click", handleFileUpload);