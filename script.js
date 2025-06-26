class P2PFileTransfer {
    constructor() {
        this.webrtc = new WebRTCHandler();
        this.selectedFiles = [];
        this.transferHistory = [];
        this.activeTransfers = new Map();
        
        this.initializeEventListeners();
        this.loadTransferHistory();
        
        // Set up WebRTC event handlers
        this.webrtc.onConnectionStateChange = (state) => {
            this.updateConnectionStatus(state);
        };
        
        this.webrtc.onDataChannelMessage = (data) => {
            this.handleReceivedData(data);
        };
        
        this.webrtc.onDataChannelOpen = () => {
            this.enableFileTransfer();
        };
    }
    
    initializeEventListeners() {
        // Connection buttons
        document.getElementById('create-room-btn').addEventListener('click', () => {
            this.createRoom();
        });
        
        document.getElementById('join-room-btn').addEventListener('click', () => {
            this.showJoinInterface();
        });
        
        document.getElementById('connect-btn').addEventListener('click', () => {
            this.joinRoom();
        });
        
        document.getElementById('copy-code-btn').addEventListener('click', () => {
            this.copyRoomCode();
        });
        
        // File selection
        document.getElementById('select-files-btn').addEventListener('click', () => {
            document.getElementById('file-input').click();
        });
        
        document.getElementById('file-input').addEventListener('change', (e) => {
            this.handleFileSelection(e.target.files);
        });
        
        // Drag and drop
        const dropZone = document.getElementById('drop-zone');
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            this.handleFileSelection(e.dataTransfer.files);
        });
        
        dropZone.addEventListener('click', () => {
            document.getElementById('file-input').click();
        });
        
        // Send files button
        document.getElementById('send-files-btn').addEventListener('click', () => {
            this.sendFiles();
        });
        
        // Clear history button
        document.getElementById('clear-history-btn').addEventListener('click', () => {
            this.clearHistory();
        });
    }
    
    async createRoom() {
        try {
            this.showToast('Creating room...', 'info');
            const roomCode = await this.webrtc.createRoom();
            
            document.getElementById('room-code').value = roomCode;
            document.getElementById('room-code-section').classList.remove('hidden');
            document.getElementById('join-code-section').classList.add('hidden');
            
            this.showToast('Room created! Share the code with your peer.', 'success');
        } catch (error) {
            this.showToast('Failed to create room: ' + error.message, 'error');
        }
    }
    
    showJoinInterface() {
        document.getElementById('join-code-section').classList.remove('hidden');
        document.getElementById('room-code-section').classList.add('hidden');
        document.getElementById('join-code').focus();
    }
    
    async joinRoom() {
        const roomCode = document.getElementById('join-code').value.trim();
        if (!roomCode) {
            this.showToast('Please enter a room code', 'error');
            return;
        }
        
        try {
            this.showToast('Connecting to room...', 'info');
            await this.webrtc.joinRoom(roomCode);
            this.showToast('Connected to room!', 'success');
        } catch (error) {
            this.showToast('Failed to join room: ' + error.message, 'error');
        }
    }
    
    copyRoomCode() {
        const roomCode = document.getElementById('room-code').value;
        navigator.clipboard.writeText(roomCode).then(() => {
            this.showToast('Room code copied to clipboard!', 'success');
        }).catch(() => {
            this.showToast('Failed to copy room code', 'error');
        });
    }
    
    updateConnectionStatus(state) {
        const statusElement = document.getElementById('connection-status');
        const icon = statusElement.querySelector('i');
        
        statusElement.className = `status-${state}`;
        
        switch (state) {
            case 'connected':
                statusElement.innerHTML = '<i class="fas fa-circle"></i> Connected';
                this.enableFileTransfer();
                break;
            case 'connecting':
                statusElement.innerHTML = '<i class="fas fa-circle"></i> Connecting...';
                break;
            case 'waiting':
                statusElement.innerHTML = '<i class="fas fa-circle"></i> Waiting for peer...';
                break;
            default:
                statusElement.innerHTML = '<i class="fas fa-circle"></i> Disconnected';
                this.disableFileTransfer();
        }
    }
    
    enableFileTransfer() {
        document.getElementById('send-files-btn').disabled = false;
    }
    
    disableFileTransfer() {
        document.getElementById('send-files-btn').disabled = true;
    }
    
    handleFileSelection(files) {
        this.selectedFiles = Array.from(files);
        this.displaySelectedFiles();
    }
    
    displaySelectedFiles() {
        const filesList = document.getElementById('files-list');
        const selectedFilesSection = document.getElementById('selected-files');
        
        if (this.selectedFiles.length === 0) {
            selectedFilesSection.classList.add('hidden');
            return;
        }
        
        selectedFilesSection.classList.remove('hidden');
        filesList.innerHTML = '';
        
        this.selectedFiles.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <div class="file-info">
                    <i class="fas fa-file file-icon"></i>
                    <div class="file-details">
                        <div class="file-name">${file.name}</div>
                        <div class="file-size">${this.formatFileSize(file.size)}</div>
                    </div>
                </div>
                <button class="remove-file" onclick="app.removeFile(${index})">
                    <i class="fas fa-times"></i>
                </button>
            `;
            filesList.appendChild(fileItem);
        });
        
        // Enable send button if connected
        if (this.webrtc.getConnectionState() === 'connected') {
            document.getElementById('send-files-btn').disabled = false;
        }
    }
    
    removeFile(index) {
        this.selectedFiles.splice(index, 1);
        this.displaySelectedFiles();
    }
    
    async sendFiles() {
        if (this.selectedFiles.length === 0) {
            this.showToast('No files selected', 'error');
            return;
        }
        
        if (this.webrtc.getConnectionState() !== 'connected') {
            this.showToast('Not connected to peer', 'error');
            return;
        }
        
        this.showTransferProgress();
        
        for (const file of this.selectedFiles) {
            await this.sendFile(file);
        }
    }
    
    async sendFile(file) {
        const fileId = this.generateFileId();
        const chunkSize = 16384; // 16KB chunks
        const totalChunks = Math.ceil(file.size / chunkSize);
        
        // Send file metadata
        const metadata = {
            type: 'file-start',
            fileId: fileId,
            name: file.name,
            size: file.size,
            totalChunks: totalChunks
        };
        
        this.webrtc.sendData(JSON.stringify(metadata));
        
        // Create progress tracking
        this.activeTransfers.set(fileId, {
            file: file,
            sentChunks: 0,
            totalChunks: totalChunks,
            startTime: Date.now()
        });
        
        this.updateProgressDisplay(fileId);
        
        // Send file chunks
        for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            const chunk = file.slice(start, end);
            
            const chunkData = {
                type: 'file-chunk',
                fileId: fileId,
                chunkIndex: i,
                data: await this.fileToBase64(chunk)
            };
            
            this.webrtc.sendData(JSON.stringify(chunkData));
            
            // Update progress
            const transfer = this.activeTransfers.get(fileId);
            transfer.sentChunks = i + 1;
            this.updateProgressDisplay(fileId);
            
            // Small delay to prevent overwhelming the data channel
            await new Promise(resolve => setTimeout(resolve, 1));
        }
        
        // Send completion message
        const completion = {
            type: 'file-end',
            fileId: fileId
        };
        
        this.webrtc.sendData(JSON.stringify(completion));
        
        // Add to history
        this.addToHistory(file.name, file.size, 'sent', 'completed');
        
        // Clean up
        this.activeTransfers.delete(fileId);
        this.updateProgressDisplay(fileId, true);
    }
    
    handleReceivedData(data) {
        try {
            const message = JSON.parse(data);
            
            switch (message.type) {
                case 'file-start':
                    this.handleFileStart(message);
                    break;
                case 'file-chunk':
                    this.handleFileChunk(message);
                    break;
                case 'file-end':
                    this.handleFileEnd(message);
                    break;
            }
        } catch (error) {
            console.error('Error handling received data:', error);
        }
    }
    
    handleFileStart(message) {
        const { fileId, name, size, totalChunks } = message;
        
        this.activeTransfers.set(fileId, {
            name: name,
            size: size,
            totalChunks: totalChunks,
            receivedChunks: 0,
            chunks: new Array(totalChunks),
            startTime: Date.now()
        });
        
        this.showTransferProgress();
        this.updateProgressDisplay(fileId);
        this.showToast(`Receiving file: ${name}`, 'info');
    }
    
    handleFileChunk(message) {
        const { fileId, chunkIndex, data } = message;
        const transfer = this.activeTransfers.get(fileId);
        
        if (transfer) {
            transfer.chunks[chunkIndex] = data;
            transfer.receivedChunks++;
            this.updateProgressDisplay(fileId);
        }
    }
    
    async handleFileEnd(message) {
        const { fileId } = message;
        const transfer = this.activeTransfers.get(fileId);
        
        if (transfer) {
            // Reconstruct file from chunks
            const blob = await this.reconstructFile(transfer.chunks);
            
            // Download file
            this.downloadFile(blob, transfer.name);
            
            // Add to history
            this.addToHistory(transfer.name, transfer.size, 'received', 'completed');
            
            // Clean up
            this.activeTransfers.delete(fileId);
            this.updateProgressDisplay(fileId, true);
            
            this.showToast(`File received: ${transfer.name}`, 'success');
        }
    }
    
    showTransferProgress() {
        document.getElementById('transfer-progress').classList.remove('hidden');
    }
    
    updateProgressDisplay(fileId, completed = false) {
        const progressList = document.getElementById('progress-list');
        const transfer = this.activeTransfers.get(fileId);
        
        if (completed) {
            const existingItem = document.getElementById(`progress-${fileId}`);
            if (existingItem) {
                existingItem.remove();
            }
            
            // Hide progress section if no active transfers
            if (this.activeTransfers.size === 0) {
                document.getElementById('transfer-progress').classList.add('hidden');
            }
            return;
        }
        
        if (!transfer) return;
        
        let progressItem = document.getElementById(`progress-${fileId}`);
        if (!progressItem) {
            progressItem = document.createElement('div');
            progressItem.id = `progress-${fileId}`;
            progressItem.className = 'progress-item';
            progressList.appendChild(progressItem);
        }
        
        const fileName = transfer.file ? transfer.file.name : transfer.name;
        const totalChunks = transfer.totalChunks;
        const completedChunks = transfer.sentChunks || transfer.receivedChunks || 0;
        const progress = (completedChunks / totalChunks) * 100;
        const isReceiving = !!transfer.receivedChunks;
        
        progressItem.innerHTML = `
            <div class="progress-header">
                <span class="file-name">${fileName}</span>
                <span class="progress-percent">${Math.round(progress)}%</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            <div class="progress-info">
                <span>${isReceiving ? 'Receiving' : 'Sending'}: ${completedChunks}/${totalChunks} chunks</span>
                <span>${this.formatFileSize(transfer.size || transfer.file.size)}</span>
            </div>
        `;
    }
    
    async fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    
    async reconstructFile(chunks) {
        const binaryStrings = chunks.map(chunk => atob(chunk));
        const bytes = new Uint8Array(binaryStrings.reduce((acc, str) => acc + str.length, 0));
        
        let offset = 0;
        for (const str of binaryStrings) {
            for (let i = 0; i < str.length; i++) {
                bytes[offset + i] = str.charCodeAt(i);
            }
            offset += str.length;
        }
        
        return new Blob([bytes]);
    }
    
    downloadFile(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    addToHistory(filename, size, direction, status) {
        const historyItem = {
            id: Date.now(),
            filename: filename,
            size: size,
            direction: direction,
            status: status,
            timestamp: new Date().toISOString()
        };
        
        this.transferHistory.unshift(historyItem);
        this.saveTransferHistory();
        this.displayTransferHistory();
    }
    
    displayTransferHistory() {
        const historyList = document.getElementById('history-list');
        
        if (this.transferHistory.length === 0) {
            historyList.innerHTML = '<p class="empty-state">No transfers yet</p>';
            return;
        }
        
        historyList.innerHTML = this.transferHistory.map(item => `
            <div class="history-item">
                <div class="history-info">
                    <div class="history-filename">
                        <i class="fas fa-${item.direction === 'sent' ? 'arrow-up' : 'arrow-down'}"></i>
                        ${item.filename}
                    </div>
                    <div class="history-details">
                        ${this.formatFileSize(item.size)} • ${this.formatDate(item.timestamp)}
                    </div>
                </div>
                <div class="history-status status-${item.status}">
                    ${item.status}
                </div>
            </div>
        `).join('');
    }
    
    clearHistory() {
        this.transferHistory = [];
        this.saveTransferHistory();
        this.displayTransferHistory();
        this.showToast('Transfer history cleared', 'info');
    }
    
    loadTransferHistory() {
        const saved = localStorage.getItem('p2p-transfer-history');
        if (saved) {
            this.transferHistory = JSON.parse(saved);
            this.displayTransferHistory();
        }
    }
    
    saveTransferHistory() {
        localStorage.setItem('p2p-transfer-history', JSON.stringify(this.transferHistory));
    }
    
    generateFileId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }
    
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icon = type === 'success' ? 'check-circle' : 
                    type === 'error' ? 'exclamation-circle' : 
                    'info-circle';
        
        toast.innerHTML = `
            <i class="fas fa-${icon}"></i>
            <span>${message}</span>
        `;
        
        document.getElementById('toast-container').appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }
}

// Initialize the application
const app = new P2PFileTransfer();
