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

async function handleFileUpload() {
    const fileInput = document.getElementById('fileInput');
    // validateFileInput(fileInput);
    if (fileInput.classList.contains('invalid')) {
        return;
    }
    const file = fileInput?.files[0]

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

function validateInput(input, checkStatement) {
    if (checkStatement) {
        input.classList.remove('invalid');
        input.classList.add('valid');
        input.nextElementSibling.textContent = '';
    } else {
        input.classList.remove('valid');
        input.classList.add('invalid');
        input.nextElementSibling.textContent = input.title;
    }
}

function fileValidateInput(input) {
    const file = input.files[0];
    const isValid = file && (file.type === 'application/zip' || file.name.endsWith('.zip'));
    validateInput(input, isValid);
}

document.addEventListener('DOMContentLoaded', function() {
    const tournamentShortNameInput = document.getElementById("tournamentShortNameInput");
    const totalPointsInput = document.getElementById("totalPointsInput");
    const fileInput = document.getElementById("fileInput");

    tournamentShortNameInput.addEventListener('input', () => validateInput(tournamentShortNameInput, tournamentShortNameInput.validity.valid));
    totalPointsInput.addEventListener('input', () => validateInput(totalPointsInput, totalPointsInput.validity.valid));
    fileInput.addEventListener('change', (event) => fileValidateInput(fileInput));
});

document.getElementById("createTournamentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    handleFileUpload();
});