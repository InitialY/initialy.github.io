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
    const tournamentShortName = document.getElementById('tournamentShortName').value;
    const tournamentShortNameMessage = document.getElementById('validateTournamentShortName');
    // Regular expression to allow only letters (both uppercase and lowercase)
    const regex = /^[A-Za-z]+$/;
    if (!regex.test(tournamentShortName)) {
        tournamentShortNameMessage.textContent = 'Invalid short name! Only letters are allowed.';
        tournamentShortNameMessage.style.color = 'red';
    }
}

// Validate input for total points
function validateTotalPointsInput() {
    const totalPoints = document.getElementById('totalPoints').value;
    const totalPointsMessage = document.getElementById('validateTotalPoints');
    if (totalPoints < 0 || totalPoints > 1400) {
        totalPointsMessage.textContent = 'Invalid total points! Points should within 0 and 1400.';
        totalPointsMessage.style.color = 'red'
    }
}

async function handleFileUpload() {
    // Show loading indicator
    const loadingIndicator = document.getElementById('loading');
    loadingIndicator.classList.remove('hidden');

    // Validation
    validateTournamentShortNameInput()
    validateTotalPointsInput()
    
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];

    if (!file) {
        alert("Please select a ZIP file.");
        return;
    }

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
        print(js.document.getElementById('tournamentName').value)
        print(js.document.getElementById('tournamentShortName').value)
        print(js.document.getElementById('totalPoints').value)
        print(js.document.getElementById('isTeam').checked)
        stream = create_and_export_single_tournament(
            tournament_dir = zipfile_path,
            tournament_name = js.document.getElementById('tournamentName').value,
            short_name = js.document.getElementById('tournamentShortName').value,
            total_points = js.document.getElementById('totalPoints').value,
            is_team = js.document.getElementById('isTeam').checked,
            excel_file_name = "${jsExcelFileName}"
        )
        list(stream)
    `);
    // Hide loading indicator
    loadingIndicator.classList.add('hidden');

    const uint8Array = new Uint8Array(excelFileData);
    
    // Create a Blob from the Excel file data
    const blob = new Blob([uint8Array], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    const downloadLink = document.getElementById("downloadLink");
    downloadLink.classList.remove('hidden');
    
    // Create a download link
    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = jsExcelFileName;
    downloadLink.style.display = 'block'; // Show the link
    downloadLink.innerText = 'Download Excel File';
}

document.getElementById("uploadButton").addEventListener("click", handleFileUpload);