const pinInput = document.getElementById('pinInput');
const joinBtn = document.getElementById('joinBtn');
const transferSection = document.getElementById('transferSection');
const fileInput = document.getElementById('fileInput');
const sendBtn = document.getElementById('sendBtn');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const totalSizeEl = document.getElementById('totalSize');
const receivedSizeEl = document.getElementById('receivedSize');
const progressPercentEl = document.getElementById('progressPercent');
const etaEl = document.getElementById('eta');

let peer, conn;
let startTime, totalSize, receivedSize = 0;

// Join room on click
joinBtn.onclick = () => {
  const pin = pinInput.value.trim();
  if (pin.length !== 4) {
    alert('Please enter a 4-digit PIN');
    return;
  }
  const peerId = pin + '-' + Math.random().toString(36).substr(2, 5);
  peer = new Peer(peerId);

  peer.on('open', id => {
    peer.listAllPeers(peers => {
      const others = peers.filter(p => p.startsWith(pin + '-') && p !== id);
      if (others.length) {
        conn = peer.connect(others[0]);
        setupConnection();
      }
    });
  });

  peer.on('connection', connection => {
    conn = connection;
    setupConnection();
  });

  joinBtn.disabled = true;
};

function setupConnection() {
  transferSection.classList.remove('hidden');
  conn.on('data', data => {
    if (!totalSize) return;
    receivedSize += data.byteLength;
    updateStats();
    receivedSizeEl.textContent = formatBytes(receivedSize);
    if (receivedSize === totalSize) {
      const blob = new Blob(receivedBuffers);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'received_file';
      a.click();
    }
  });
}

sendBtn.onclick = () => {
  const file = fileInput.files[0];
  if (!file) return;
  const chunkSize = 16 * 1024;
  totalSize = file.size;
  receivedSize = 0;
  totalSizeEl.textContent = formatBytes(totalSize);
  progressContainer.classList.remove('hidden');
  startTime = Date.now();

  const reader = new FileReader();
  let offset = 0;
  reader.onload = e => {
    conn.send(e.target.result);
    offset += chunkSize;
    progressBar.style.width = ((offset / totalSize) * 100) + '%';
    progressPercentEl.textContent = Math.floor((offset / totalSize) * 100) + '%';
    updateStats();
    if (offset < totalSize) {
      readSlice(offset);
    }
  };

  const readSlice = o => {
    const slice = file.slice(offset, o + chunkSize);
    reader.readAsArrayBuffer(slice);
  };
  readSlice(0);
};

function updateStats() {
  const elapsed = (Date.now() - startTime) / 1000;
  const speed = receivedSize / elapsed;
  const remaining = (totalSize - receivedSize) / speed;
  etaEl.textContent = `${Math.floor(remaining)}s`;
}

function formatBytes(bytes) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(2) + ' MB';
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(2) + ' KB';
  return bytes + ' B';
}