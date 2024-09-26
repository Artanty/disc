async function check() {
    try {
        const res = await fetch('https://disc-38hr.onrender.com/get-updates', {
            method: 'POST',
            body: null
        });
        console.log(res)
    } catch (error) {
        console.error("Error in check function:", error)
    }
}


document.getElementById('uploadForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const form = event.target;
    const formData = new FormData(form);

    try {
        const response = await fetch('https://disc-38hr.onrender.com/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        document.getElementById('uploadResponse').innerText = `File uploaded successfully. ID: ${result.fileId}`;
    } catch (error) {
        document.getElementById('uploadResponse').innerText = `Error: ${error.message}`;
    }
});

document.getElementById('downloadForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const fileId = form.fileId.value;

    try {
        const response = await fetch('http://localhost:3021/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fileId: fileId })
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `downloaded_file`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        } else {
            const result = await response.json();
            document.getElementById('downloadResponse').innerText = `Error: ${result.error}`;
        }
    } catch (error) {
        document.getElementById('downloadResponse').innerText = `Error: ${error.message}`;
    }
});

document.getElementById('deleteForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const fileId = form.fileId.value;

    try {
        const response = await fetch('http://localhost:3021/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fileId: fileId })
        });

        await response.json();
        document.getElementById('deleteResponse').innerText = `Success!`;
    } catch (error) {
        document.getElementById('deleteResponse').innerText = error;
    }
});