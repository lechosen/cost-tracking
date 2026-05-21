const Upload = (() => {
  let selectedFile = null;

  function init() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const submitBtn = document.getElementById('upload-submit');
    const resultEl = document.getElementById('upload-result');
    const filenameEl = document.getElementById('upload-filename');

    fileInput.addEventListener('change', () => {
      selectedFile = fileInput.files[0] || null;
      updateUI();
    });

    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      selectedFile = e.dataTransfer.files[0] || null;
      updateUI();
    });

    submitBtn.addEventListener('click', async () => {
      if (!selectedFile) return;
      submitBtn.disabled = true;
      resultEl.textContent = 'Uploading and categorizing… (this may take a moment)';
      resultEl.style.color = 'var(--muted)';

      const fd = new FormData();
      fd.append('file', selectedFile);
      try {
        const res = await API.postForm('/api/upload', fd);
        resultEl.textContent = `Done: ${res.inserted} new transactions inserted (${res.total_parsed} parsed).`;
        resultEl.style.color = 'var(--green)';
        selectedFile = null;
        fileInput.value = '';
        filenameEl.textContent = '';
        submitBtn.disabled = true;
      } catch (e) {
        resultEl.textContent = 'Error: ' + e.message;
        resultEl.style.color = 'var(--red)';
        submitBtn.disabled = false;
      }
    });

    function updateUI() {
      if (selectedFile) {
        filenameEl.textContent = selectedFile.name;
        submitBtn.disabled = false;
      } else {
        filenameEl.textContent = '';
        submitBtn.disabled = true;
      }
    }
  }

  return { init };
})();
