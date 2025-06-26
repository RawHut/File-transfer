class WebRTCHandler {
    constructor() {
        this.localConnection = null;
        this.remoteConnection = null;
        this.dataChannel = null;
        this.isInitiator = false;
        this.connectionState = 'disconnected';
        this.onConnectionStateChange = null;
        this.onDataChannelMessage = null;
        this.onDataChannelOpen = null;
        
        // ICE servers for NAT traversal
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ];
        
        this.pendingOffers = new Map();
        this.pendingAnswers = new Map();
    }
    
    generateRoomCode() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
    
    async createRoom() {
        try {
            this.isInitiator = true;
            this.roomCode = this.generateRoomCode();
            
            await this.initializeConnection();
            this.updateConnectionState('waiting');
            
            return this.roomCode;
        } catch (error) {
            console.error('Error creating room:', error);
            throw error;
        }
    }
    
    async joinRoom(roomCode) {
        try {
            this.isInitiator = false;
            this.roomCode = roomCode;
            
            await this.initializeConnection();
            this.updateConnectionState('connecting');
            
            return true;
        } catch (error) {
            console.error('Error joining room:', error);
            throw error;
        }
    }
    
    async initializeConnection() {
        try {
            // Create RTCPeerConnection
            this.localConnection = new RTCPeerConnection({
                iceServers: this.iceServers
            });
            
            // Set up event handlers
            this.localConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.handleIceCandidate(event.candidate);
                }
            };
            
            this.localConnection.onconnectionstatechange = () => {
                const state = this.localConnection.connectionState;
                console.log('Connection state:', state);
                
                if (state === 'connected') {
                    this.updateConnectionState('connected');
                } else if (state === 'disconnected' || state === 'failed') {
                    this.updateConnectionState('disconnected');
                } else if (state === 'connecting') {
                    this.updateConnectionState('connecting');
                }
            };
            
            this.localConnection.ondatachannel = (event) => {
                const channel = event.channel;
                this.setupDataChannel(channel);
            };
            
            if (this.isInitiator) {
                // Create data channel for file transfer
                this.dataChannel = this.localConnection.createDataChannel('fileTransfer', {
                    ordered: true
                });
                this.setupDataChannel(this.dataChannel);
                
                // Create offer
                const offer = await this.localConnection.createOffer();
                await this.localConnection.setLocalDescription(offer);
                
                // Store offer for sharing
                this.localOffer = offer;
            }
            
        } catch (error) {
            console.error('Error initializing connection:', error);
            throw error;
        }
    }
    
    setupDataChannel(channel) {
        this.dataChannel = channel;
        
        channel.onopen = () => {
            console.log('Data channel opened');
            if (this.onDataChannelOpen) {
                this.onDataChannelOpen();
            }
        };
        
        channel.onmessage = (event) => {
            if (this.onDataChannelMessage) {
                this.onDataChannelMessage(event.data);
            }
        };
        
        channel.onclose = () => {
            console.log('Data channel closed');
        };
        
        channel.onerror = (error) => {
            console.error('Data channel error:', error);
        };
    }
    
    async handleRemoteOffer(offerData) {
        try {
            const offer = new RTCSessionDescription(offerData);
            await this.localConnection.setRemoteDescription(offer);
            
            // Create answer
            const answer = await this.localConnection.createAnswer();
            await this.localConnection.setLocalDescription(answer);
            
            return answer;
        } catch (error) {
            console.error('Error handling remote offer:', error);
            throw error;
        }
    }
    
    async handleRemoteAnswer(answerData) {
        try {
            const answer = new RTCSessionDescription(answerData);
            await this.localConnection.setRemoteDescription(answer);
        } catch (error) {
            console.error('Error handling remote answer:', error);
            throw error;
        }
    }
    
    async handleRemoteIceCandidate(candidateData) {
        try {
            const candidate = new RTCIceCandidate(candidateData);
            await this.localConnection.addIceCandidate(candidate);
        } catch (error) {
            console.error('Error handling remote ICE candidate:', error);
        }
    }
    
    handleIceCandidate(candidate) {
        // In a real implementation, this would be sent to the remote peer
        // For now, we'll store it for manual exchange
        console.log('New ICE candidate:', candidate);
    }
    
    getConnectionData() {
        const data = {
            roomCode: this.roomCode,
            isInitiator: this.isInitiator
        };
        
        if (this.isInitiator && this.localOffer) {
            data.offer = this.localOffer;
        }
        
        return data;
    }
    
    async processConnectionData(data) {
        try {
            if (data.offer && !this.isInitiator) {
                const answer = await this.handleRemoteOffer(data.offer);
                return { answer };
            } else if (data.answer && this.isInitiator) {
                await this.handleRemoteAnswer(data.answer);
                return null;
            }
        } catch (error) {
            console.error('Error processing connection data:', error);
            throw error;
        }
    }
    
    sendData(data) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(data);
            return true;
        }
        return false;
    }
    
    updateConnectionState(state) {
        this.connectionState = state;
        if (this.onConnectionStateChange) {
            this.onConnectionStateChange(state);
        }
    }
    
    disconnect() {
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }
        
        if (this.localConnection) {
            this.localConnection.close();
            this.localConnection = null;
        }
        
        this.updateConnectionState('disconnected');
    }
    
    getConnectionState() {
        return this.connectionState;
    }
}
