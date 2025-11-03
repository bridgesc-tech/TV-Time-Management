// TV Time Manager Application
class TVTimeManager {
    constructor() {
        this.children = [];
        this.firebaseEnabled = false;
        this.familyId = this.getOrCreateFamilyId();
        this.isProcessingBonus = false; // Flag to prevent Firebase overwrites during bonus processing
        // Wait for Firebase scripts to load, then initialize
        // Check multiple times in case scripts load slowly on mobile
        this.waitForFirebase(() => {
            this.initializeFirebase();
            this.loadChildren().then(() => {
                this.initializeApp();
                this.setupMidnightScheduler(); // This calls checkDailyBonus() internally
            });
        });
    }

    waitForFirebase(callback, attempts = 0) {
        const maxAttempts = 20; // Try for up to 2 seconds (20 * 100ms)
        if (typeof firebase !== 'undefined' || attempts >= maxAttempts) {
            callback();
        } else {
            setTimeout(() => {
                this.waitForFirebase(callback, attempts + 1);
            }, 100);
        }
    }

    // Get or create a unique family ID for syncing
    getOrCreateFamilyId() {
        let familyId = localStorage.getItem('tvTimeFamilyId');
        if (!familyId) {
            // Generate a unique family ID (you can share this with other phones)
            familyId = 'family_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('tvTimeFamilyId', familyId);
        }
        return familyId;
    }

    // Initialize Firebase connection
    initializeFirebase() {
        // Check if db is available (might take a moment for scripts to load)
        const checkFirebase = () => {
            if (typeof window !== 'undefined' && typeof db !== 'undefined' && db !== null) {
                this.firebaseEnabled = true;
                console.log('Firebase sync enabled for family:', this.familyId);
                
                // Listen for real-time updates from other devices
                db.collection('families').doc(this.familyId)
                    .onSnapshot((docSnapshot) => {
                        if (docSnapshot.exists && docSnapshot.data().children) {
                            // Don't overwrite if we're currently processing the daily bonus
                            if (this.isProcessingBonus) {
                                console.log('Ignoring cloud sync - processing daily bonus');
                                return;
                            }
                            
                            const cloudData = docSnapshot.data();
                            const cloudChildren = cloudData.children;
                            const cloudLastMidnightCheck = cloudData.lastMidnightCheck;
                            
                            // Get local lastMidnightCheck
                            const localLastMidnightCheck = this.loadLastMidnightCheck();
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            
                            // Parse dates for comparison
                            let cloudDate = null;
                            if (cloudLastMidnightCheck) {
                                const parsed = new Date(cloudLastMidnightCheck);
                                if (!isNaN(parsed.getTime())) {
                                    parsed.setHours(0, 0, 0, 0);
                                    cloudDate = parsed;
                                }
                            }
                            
                            let localDate = null;
                            if (localLastMidnightCheck) {
                                const parsed = new Date(localLastMidnightCheck);
                                if (!isNaN(parsed.getTime())) {
                                    parsed.setHours(0, 0, 0, 0);
                                    localDate = parsed;
                                }
                            }
                            
                            // If we've already processed today's bonus locally, don't overwrite with older cloud data
                            if (localDate && localDate.getTime() === today.getTime()) {
                                // We've processed today locally - check if cloud data is also from today
                                if (!cloudDate || cloudDate.getTime() < today.getTime()) {
                                    console.log('Ignoring cloud sync - local data has today\'s bonus, cloud data is older');
                                    return;
                                }
                            }
                            
                            // Merge with local data (cloud takes precedence, but preserve today's bonus if we have it)
                            this.children = cloudChildren;
                            this.saveToLocalStorage();
                            this.renderChildren();
                            console.log('Synced from cloud');
                        }
                    }, (error) => {
                        console.error('Firebase sync error:', error);
                    });
                
                this.updateSyncStatus();
                return true;
            }
            return false;
        };
        
        // Try immediately
        if (!checkFirebase()) {
            // If not ready yet, try again after a short delay
            setTimeout(() => {
                if (!checkFirebase()) {
                    console.log('Firebase not configured - running in local-only mode');
                    this.updateSyncStatus();
                }
            }, 500);
        }
    }

    async loadChildren() {
        if (this.firebaseEnabled) {
            try {
                const docSnapshot = await db.collection('families').doc(this.familyId).get();
                if (docSnapshot.exists && docSnapshot.data().children) {
                    this.children = docSnapshot.data().children;
                    this.saveToLocalStorage();
                    return this.children;
                }
            } catch (error) {
                console.error('Error loading from Firebase:', error);
                // Fall back to localStorage
            }
        }
        
        // Fall back to localStorage
        const stored = localStorage.getItem('tvTimeChildren');
        this.children = stored ? JSON.parse(stored) : [];
        return this.children;
    }

    saveChildren() {
        // Always save to localStorage first (instant)
        this.saveToLocalStorage();
        
        // Then sync to Firebase (if enabled)
        if (this.firebaseEnabled) {
            db.collection('families').doc(this.familyId).set({
                children: this.children,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                lastMidnightCheck: this.loadLastMidnightCheck()
            }, { merge: true })
            .then(() => {
                console.log('Synced to cloud');
            })
            .catch((error) => {
                console.error('Error syncing to Firebase:', error);
            });
        }
    }

    saveToLocalStorage() {
        localStorage.setItem('tvTimeChildren', JSON.stringify(this.children));
    }

    loadLastMidnightCheck() {
        // Always use localStorage for now (Firebase syncs it separately)
        // This ensures instant reads without async complexity
        return localStorage.getItem('lastMidnightCheck') || null;
    }

    saveLastMidnightCheck(date) {
        localStorage.setItem('lastMidnightCheck', date);
        // Also save to Firebase if enabled
        if (this.firebaseEnabled) {
            db.collection('families').doc(this.familyId).set({
                lastMidnightCheck: date
            }, { merge: true });
        }
    }

    initializeApp() {
        // Register service worker only if not running from file:// (standalone mode)
        // Service worker is optional - app works fine without it for standalone use
        if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
            navigator.serviceWorker.register('./service-worker.js')
                .then(reg => console.log('Service Worker registered'))
                .catch(err => {
                    // Silently fail - app works without service worker
                });
        }

        // Show sync status
        this.updateSyncStatus();
        
        // Setup Family ID UI
        this.setupFamilyIdUI();

        // Setup event listeners
        document.getElementById('addChildBtn').addEventListener('click', () => this.addChild());
        document.getElementById('childNameInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addChild();
        });
        
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());

        // Time adjustment buttons
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                const amount = parseInt(e.target.dataset.amount);
                this.adjustTime(this.currentChildId, action, amount);
            });
        });

        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            const modal = document.getElementById('timeModal');
            if (e.target === modal) {
                this.closeModal();
            }
            const familyModal = document.getElementById('familyModal');
            if (e.target === familyModal) {
                this.closeFamilyModal();
            }
        });

        // Family Sync Modal button
        document.getElementById('openFamilyModalBtn').addEventListener('click', () => {
            this.openFamilyModal();
        });
        document.getElementById('closeFamilyModal').addEventListener('click', () => {
            this.closeFamilyModal();
        });

        this.renderChildren();
    }

    addChild() {
        const input = document.getElementById('childNameInput');
        const name = input.value.trim();
        
        if (!name) {
            alert('Please enter a child\'s name');
            return;
        }
        
        // Check if child already exists
        if (this.children.some(child => child.name.toLowerCase() === name.toLowerCase())) {
            alert('A child with this name already exists');
            input.value = '';
            return;
        }
        
        const newChild = {
            id: Date.now().toString(),
            name: name,
            timeBalance: 0, // Time in minutes
            createdAt: new Date().toISOString()
        };

        this.children.push(newChild);
        this.saveChildren();
        input.value = '';
        this.renderChildren();
    }

    deleteChild(id) {
        if (confirm('Are you sure you want to remove this child?')) {
            this.children = this.children.filter(child => child.id !== id);
            this.saveChildren();
            this.renderChildren();
        }
    }

    openTimeModal(childId) {
        const child = this.children.find(c => c.id === childId);
        if (!child) return;

        this.currentChildId = childId;
        document.getElementById('modalChildName').textContent = child.name;
        document.getElementById('modalCurrentTime').textContent = this.formatTime(child.timeBalance);
        document.getElementById('timeModal').style.display = 'block';
    }

    closeModal() {
        document.getElementById('timeModal').style.display = 'none';
        this.currentChildId = null;
    }

    adjustTime(childId, action, amount) {
        const child = this.children.find(c => c.id === childId);
        if (!child) return;

        if (action === 'add') {
            child.timeBalance += amount;
        } else if (action === 'subtract') {
            child.timeBalance = Math.max(0, child.timeBalance - amount);
        }

        this.saveChildren();
        this.renderChildren();
        
        // Update modal display
        if (this.currentChildId === childId) {
            document.getElementById('modalCurrentTime').textContent = this.formatTime(child.timeBalance);
        }
    }

    formatTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        
        if (hours > 0) {
            return `${hours}h ${mins}m`;
        }
        return `${mins}m`;
    }

    checkDailyBonus() {
        try {
            // Set flag to prevent Firebase overwrites during bonus processing
            this.isProcessingBonus = true;
            
            const lastCheck = this.loadLastMidnightCheck();
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            today.setHours(0, 0, 0, 0); // Ensure it's exactly midnight
            
            // Get last midnight with validation
            let lastMidnight = null;
            if (lastCheck) {
                const parsedDate = new Date(lastCheck);
                // Check if date is valid
                if (!isNaN(parsedDate.getTime())) {
                    parsedDate.setHours(0, 0, 0, 0); // Normalize to midnight
                    lastMidnight = parsedDate;
                } else {
                    // Invalid date stored, clear it
                    localStorage.removeItem('lastMidnightCheck');
                }
            }
            
            // Check if we've already given bonus today
            if (lastMidnight && lastMidnight.getTime() === today.getTime()) {
                this.isProcessingBonus = false;
                this.renderChildren();
                return; // Already checked today
            }

            // Calculate days since last check (with safety limit)
            let daysToAdd = 0;
            if (lastMidnight && lastMidnight < today) {
                const diffTime = today.getTime() - lastMidnight.getTime();
                daysToAdd = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                // Safety limit: max 365 days at once (prevent infinite loops)
                daysToAdd = Math.min(daysToAdd, 365);
            } else if (!lastMidnight) {
                // First time - no bonus to add today
                this.saveLastMidnightCheck(today.toISOString());
                this.isProcessingBonus = false;
                this.renderChildren();
                return;
            }

            // Add 30 minutes for each missed day
            if (daysToAdd > 0 && daysToAdd <= 365) {
                const bonusAmount = 30 * daysToAdd;
                this.children.forEach(child => {
                    child.timeBalance += bonusAmount;
                });
                this.saveLastMidnightCheck(today.toISOString());
                this.saveChildren();
                
                // Wait a moment for Firebase to sync before clearing the flag
                setTimeout(() => {
                    this.isProcessingBonus = false;
                }, 2000); // 2 seconds should be enough for Firebase to sync
            } else {
                this.isProcessingBonus = false;
            }

            this.renderChildren();
        } catch (error) {
            console.error('Error in checkDailyBonus:', error);
            this.isProcessingBonus = false;
            // If there's an error, just render children without checking bonus
            this.renderChildren();
        }
    }

    setupMidnightScheduler() {
        // Check immediately when app loads
        this.checkDailyBonus();

        // Set up interval to check every minute
        setInterval(() => {
            this.checkDailyBonus();
        }, 60000); // Check every minute

        // Also schedule for exactly at midnight
        this.scheduleMidnightCheck();
    }

    scheduleMidnightCheck() {
        const now = new Date();
        const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const msUntilMidnight = midnight - now;

        setTimeout(() => {
            this.checkDailyBonus();
            // After first midnight check, continue checking daily
            setInterval(() => {
                this.checkDailyBonus();
            }, 24 * 60 * 60 * 1000); // Check every 24 hours
        }, msUntilMidnight);
    }

    renderChildren() {
        const container = document.getElementById('childrenList');
        const emptyState = document.getElementById('emptyState');

        if (this.children.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        container.innerHTML = '';

        this.children.forEach(child => {
            const card = document.createElement('div');
            card.className = 'child-card';
            
            const timeClass = child.timeBalance > 60 ? 'time-high' : 
                            child.timeBalance > 0 ? 'time-medium' : 'time-low';
            
            card.innerHTML = `
                <div class="child-header">
                    <h3>${this.escapeHtml(child.name)}</h3>
                    <button class="delete-btn" onclick="app.deleteChild('${child.id}')" aria-label="Delete child">×</button>
                </div>
                <div class="time-display ${timeClass} clickable-time" onclick="app.openTimeModal('${child.id}')" style="cursor: pointer;">
                    <span class="time-label">Time Balance:</span>
                    <span class="time-value">${this.formatTime(child.timeBalance)}</span>
                </div>
            `;

            container.appendChild(card);
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateSyncStatus() {
        const statusEl = document.getElementById('syncStatus');
        if (statusEl) {
            if (this.firebaseEnabled) {
                statusEl.innerHTML = '🟢 Syncing across devices';
                statusEl.style.color = '#90EE90'; // Light green for better visibility
                statusEl.style.fontWeight = '600';
            } else {
                statusEl.innerHTML = '⚪ Local mode (Firebase not configured)';
                statusEl.style.color = 'rgba(255, 255, 255, 0.8)'; // White with slight transparency
                statusEl.style.fontWeight = '500';
            }
        }
    }

    openFamilyModal() {
        // Update Family ID display
        const familyIdDisplay = document.getElementById('familyIdDisplay');
        if (familyIdDisplay) {
            familyIdDisplay.value = this.familyId;
        }
        document.getElementById('familyModal').style.display = 'block';
    }

    closeFamilyModal() {
        document.getElementById('familyModal').style.display = 'none';
    }

    setupFamilyIdUI() {
        // Copy Family ID button
        const copyBtn = document.getElementById('copyFamilyIdBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const familyIdInput = document.getElementById('familyIdDisplay');
                familyIdInput.select();
                familyIdInput.setSelectionRange(0, 99999); // For mobile
                try {
                    document.execCommand('copy');
                    copyBtn.textContent = 'Copied!';
                    copyBtn.style.background = '#52C41A';
                    setTimeout(() => {
                        copyBtn.textContent = 'Copy';
                        copyBtn.style.background = '';
                    }, 2000);
                } catch (err) {
                    // Fallback for modern browsers
                    navigator.clipboard.writeText(this.familyId).then(() => {
                        copyBtn.textContent = 'Copied!';
                        copyBtn.style.background = '#52C41A';
                        setTimeout(() => {
                            copyBtn.textContent = 'Copy';
                            copyBtn.style.background = '';
                        }, 2000);
                    });
                }
            });
        }

        // Set Family ID button
        const setBtn = document.getElementById('setFamilyIdBtn');
        const familyIdInput = document.getElementById('familyIdInput');
        if (setBtn && familyIdInput) {
            setBtn.addEventListener('click', () => {
                const newFamilyId = familyIdInput.value.trim();
                if (newFamilyId && newFamilyId.length > 0) {
                    if (confirm('This will connect to a different family. All local data will sync with the new family. Continue?')) {
                        localStorage.setItem('tvTimeFamilyId', newFamilyId);
                        this.familyId = newFamilyId;
                        const familyIdDisplay = document.getElementById('familyIdDisplay');
                        if (familyIdDisplay) {
                            familyIdDisplay.value = newFamilyId;
                        }
                        familyIdInput.value = '';
                        
                        // Reinitialize Firebase connection with new family ID
                        if (this.firebaseEnabled) {
                            // Remove old listener and setup new one
                            location.reload(); // Simplest way to restart with new ID
                        } else {
                            alert('Family ID updated. Refresh the page to connect.');
                        }
                    }
                } else {
                    alert('Please enter a Family ID');
                }
            });
            
            // Allow Enter key
            familyIdInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    setBtn.click();
                }
            });
        }
    }
}

// Initialize the app
let app;
document.addEventListener('DOMContentLoaded', () => {
    try {
        app = new TVTimeManager();
    } catch (error) {
        console.error('Failed to initialize app:', error);
        // Show error message to user
        const container = document.querySelector('.container');
        if (container) {
            container.innerHTML = '<h1>Error Loading App</h1><p>Please refresh the page. If the problem persists, clear your browser cache.</p>';
        }
    }
});

// Suppress harmless browser extension errors in console
window.addEventListener('error', (event) => {
    if (event.message && event.message.includes('message channel closed')) {
        event.preventDefault();
        return false;
    }
}, true);

