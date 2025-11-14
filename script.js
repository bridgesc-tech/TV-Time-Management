// TV Time Manager Application
class TVTimeManager {
    constructor() {
        this.children = [];
        this.firebaseEnabled = false;
        this.familyId = this.getOrCreateFamilyId();
        this.isProcessingBonus = false; // Flag to prevent Firebase overwrites during bonus processing
        
        // Time adjustment state - single unified array ordered from negative to positive
        // Add moves right (higher values), Subtract moves left (lower values)
        this.timeAmounts = [-60, -30, -15, -10, -5, 0, 5, 10, 15, 30, 60];
        this.currentAmountIndex = 5; // Start at index 5 which is 0
        
        // Default chores (empty - all chores are custom)
        this.defaultChores = [];
        
        // Custom chores (synced across family via Firebase)
        this.customChores = [];
        this.chores = []; // Combined list (starts empty)
        
        // Track which chore is being edited
        this.editingChoreId = null;
        // Track if we're in edit mode for chores
        this.choresEditMode = false;
        
        // Wait for Firebase scripts to load, then initialize
        // Check multiple times in case scripts load slowly on mobile
        this.waitForFirebase(() => {
            this.initializeFirebase();
            this.loadChildren().then(() => {
                // Load custom chores (handle errors gracefully)
                this.loadCustomChores().catch(error => {
                    console.error('Error loading custom chores:', error);
                    this.customChores = [];
                    this.updateChoresList();
                }).then(() => {
                    this.initializeApp();
                    this.setupMidnightScheduler(); // This calls checkDailyBonus() internally
                });
            }).catch(error => {
                console.error('Error loading children:', error);
                // Still initialize app even if loading fails
                this.initializeApp();
                this.setupMidnightScheduler();
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
                        if (docSnapshot.exists) {
                            const data = docSnapshot.data();
                            
                            // Sync custom chores
                            if (data.customChores) {
                                this.customChores = data.customChores;
                                this.updateChoresList();
                                localStorage.setItem('tvTimeCustomChores', JSON.stringify(this.customChores));
                                // Refresh chores display if it's currently open
                                if (document.getElementById('choresList').style.display !== 'none') {
                                    this.renderChores();
                                }
                            }
                            
                            if (data.children) {
                                // Don't overwrite if we're currently processing the daily bonus
                                if (this.isProcessingBonus) {
                                    console.log('Ignoring cloud sync - processing daily bonus');
                                    return;
                                }
                                
                                const cloudChildren = data.children;
                                const cloudLastMidnightCheck = data.lastMidnightCheck;
                            
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
    
    async loadCustomChores() {
        try {
            if (this.firebaseEnabled && typeof db !== 'undefined' && db !== null) {
                try {
                    const docSnapshot = await db.collection('families').doc(this.familyId).get();
                    if (docSnapshot.exists && docSnapshot.data().customChores) {
                        this.customChores = docSnapshot.data().customChores;
                        this.updateChoresList();
                    } else {
                        this.customChores = [];
                        this.updateChoresList();
                    }
                    return this.customChores;
                } catch (error) {
                    console.error('Error loading custom chores from Firebase:', error);
                    // Fall through to localStorage
                }
            }
            // Fall back to localStorage
            const stored = localStorage.getItem('tvTimeCustomChores');
            this.customChores = stored ? JSON.parse(stored) : [];
            this.updateChoresList();
            return this.customChores;
        } catch (error) {
            console.error('Error in loadCustomChores:', error);
            this.customChores = [];
            this.updateChoresList();
            return this.customChores;
        }
    }
    
    updateChoresList() {
        // Combine default and custom chores
        this.chores = [...this.defaultChores, ...this.customChores];
    }
    
    async saveCustomChores() {
        // Always save to localStorage first
        localStorage.setItem('tvTimeCustomChores', JSON.stringify(this.customChores));
        
        // Then sync to Firebase
        if (this.firebaseEnabled) {
            db.collection('families').doc(this.familyId).set({
                customChores: this.customChores,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true })
            .then(() => {
                console.log('Custom chores synced to cloud');
            })
            .catch((error) => {
                console.error('Error syncing custom chores to Firebase:', error);
            });
        }
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
        // Service worker registration is now handled by UpdateManager

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

        // Time adjustment controls - Add button (moves right through the array - higher values)
        document.getElementById('modeAdd').addEventListener('click', () => {
            // Check if we're at the last item (can't go further)
            if (this.currentAmountIndex === this.timeAmounts.length - 1) {
                // Already at maximum (+60), do nothing
                return;
            }
            // Move to next higher value
            this.currentAmountIndex++;
            this.currentAmount = this.timeAmounts[this.currentAmountIndex];
            this.updateAmountDisplay();
        });
        
        // Time adjustment controls - Subtract button (moves left through the array - lower values)
        document.getElementById('modeSubtract').addEventListener('click', () => {
            // Check if we're at the first item (can't go further)
            if (this.currentAmountIndex === 0) {
                // Already at minimum (-60), do nothing
                return;
            }
            // Move to next lower value
            this.currentAmountIndex--;
            this.currentAmount = this.timeAmounts[this.currentAmountIndex];
            this.updateAmountDisplay();
        });
        
        // Time adjustment controls - Apply button
        document.getElementById('applyTimeBtn').addEventListener('click', () => {
            if (this.currentChildId) {
                const amount = Math.abs(this.currentAmount);
                // Determine if adding or subtracting based on current amount value
                if (this.currentAmount > 0) {
                    this.adjustTime(this.currentChildId, 'add', amount);
                } else if (this.currentAmount < 0) {
                    this.adjustTime(this.currentChildId, 'subtract', amount);
                }
                // Reset to 0 after applying (only if amount was not 0)
                if (this.currentAmount !== 0) {
                    this.currentAmountIndex = 5; // Reset to 0 (index 5)
                    this.currentAmount = this.timeAmounts[this.currentAmountIndex];
                    this.updateAmountDisplay();
                }
            }
        });
        
        // Chores button - show/hide chores list
        document.getElementById('showChoresBtn').addEventListener('click', () => {
            const choresList = document.getElementById('choresList');
            if (choresList.style.display === 'none') {
                this.choresEditMode = false; // Reset edit mode when opening
                this.renderChores();
                choresList.style.display = 'block';
                document.getElementById('showChoresBtn').textContent = '❌ Close Chores';
            } else {
                choresList.style.display = 'none';
                document.getElementById('showChoresBtn').textContent = '📋 Chores';
            }
        });
        
        // Toggle edit mode button
        document.getElementById('toggleEditModeBtn').addEventListener('click', () => {
            this.choresEditMode = !this.choresEditMode;
            this.renderChores();
        });
        
        // Add Chore Modal
        document.getElementById('closeAddChoreModal').addEventListener('click', () => {
            this.closeAddChoreModal();
        });
        
        // Save Chore button
        document.getElementById('saveChoreBtn').addEventListener('click', () => {
            this.saveNewChore();
        });
        
        // Allow Enter key in name input
        document.getElementById('choreNameInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.saveNewChore();
            }
        });
        
        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            const addChoreModal = document.getElementById('addChoreModal');
            if (e.target === addChoreModal) {
                this.closeAddChoreModal();
            }
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
        this.currentAmountIndex = 5; // Reset to 0 (index 5)
        this.currentAmount = this.timeAmounts[this.currentAmountIndex];
        document.getElementById('modalChildName').textContent = child.name;
        document.getElementById('modalCurrentTime').textContent = this.formatTime(child.timeBalance);
        this.updateAmountDisplay();
        // Hide chores list when opening modal
        document.getElementById('choresList').style.display = 'none';
        document.getElementById('showChoresBtn').textContent = '📋 Chores';
        document.getElementById('timeModal').style.display = 'block';
    }
    
    renderChores() {
        const choresGrid = document.getElementById('choresGrid');
        const toggleEditBtn = document.getElementById('toggleEditModeBtn');
        choresGrid.innerHTML = '';
        
        // Update edit mode button
        if (this.choresEditMode) {
            toggleEditBtn.textContent = '✓';
            toggleEditBtn.title = 'Done editing';
            toggleEditBtn.classList.add('edit-mode-active');
        } else {
            toggleEditBtn.textContent = '✏️';
            toggleEditBtn.title = 'Edit chores';
            toggleEditBtn.classList.remove('edit-mode-active');
        }
        
        // Render all custom chores
        this.customChores.forEach((chore) => {
            const choreCard = document.createElement('div');
            choreCard.className = 'chore-card';
            
            if (this.choresEditMode) {
                // Edit mode - show edit/delete buttons
                choreCard.innerHTML = `
                    <div class="chore-card-content">
                        <div class="chore-name">${this.escapeHtml(chore.name)}</div>
                        <div class="chore-time">+${this.formatTime(chore.time)}</div>
                    </div>
                    <div class="chore-actions">
                        <button class="chore-edit-btn" data-chore-id="${chore.id}" title="Edit">✏️</button>
                        <button class="chore-delete-btn" data-chore-id="${chore.id}" title="Delete">🗑️</button>
                    </div>
                `;
                
                // In edit mode, clicking the card edits it
                const cardContent = choreCard.querySelector('.chore-card-content');
                cardContent.addEventListener('click', () => {
                    this.editChore(chore.id);
                });
                
                // Edit button
                const editBtn = choreCard.querySelector('.chore-edit-btn');
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.editChore(chore.id);
                });
                
                // Delete button
                const deleteBtn = choreCard.querySelector('.chore-delete-btn');
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteChore(chore.id);
                });
            } else {
                // Normal mode - just show chore, clicking adds time
                choreCard.innerHTML = `
                    <div class="chore-card-content">
                        <div class="chore-name">${this.escapeHtml(chore.name)}</div>
                        <div class="chore-time">+${this.formatTime(chore.time)}</div>
                    </div>
                `;
                
                // Click to add time
                choreCard.addEventListener('click', () => {
                    if (this.currentChildId) {
                        this.adjustTime(this.currentChildId, 'add', chore.time);
                        // Close chores list after selection
                        document.getElementById('choresList').style.display = 'none';
                        document.getElementById('showChoresBtn').textContent = '📋 Chores';
                    }
                });
            }
            
            choresGrid.appendChild(choreCard);
        });
        
        // Add "Add Chore" card at the end (or first if no chores)
        const addChoreCard = document.createElement('div');
        addChoreCard.className = 'chore-card add-chore-card';
        addChoreCard.innerHTML = `
            <div class="add-chore-icon">➕</div>
            <div class="add-chore-text">Add Chore</div>
        `;
        addChoreCard.addEventListener('click', () => {
            this.openAddChoreModal();
        });
        choresGrid.appendChild(addChoreCard);
    }
    
    editChore(choreId) {
        const chore = this.customChores.find(c => c.id === choreId);
        if (!chore) return;
        
        this.editingChoreId = choreId;
        document.getElementById('choreNameInput').value = chore.name;
        document.getElementById('choreTimeInput').value = chore.time.toString();
        document.getElementById('addChoreModal').style.display = 'block';
        document.querySelector('#addChoreModal h2').textContent = 'Edit Chore';
        document.getElementById('saveChoreBtn').textContent = 'Update Chore';
        setTimeout(() => {
            document.getElementById('choreNameInput').focus();
        }, 100);
    }
    
    deleteChore(choreId) {
        const chore = this.customChores.find(c => c.id === choreId);
        if (!chore) return;
        
        if (confirm(`Are you sure you want to delete "${chore.name}"?`)) {
            this.customChores = this.customChores.filter(c => c.id !== choreId);
            this.updateChoresList();
            this.saveCustomChores();
            this.renderChores(); // Refresh display
        }
    }
    
    openAddChoreModal() {
        this.editingChoreId = null; // Reset editing state
        document.getElementById('choreNameInput').value = '';
        document.getElementById('choreTimeInput').value = '5'; // Reset to default (5 minutes)
        document.querySelector('#addChoreModal h2').textContent = 'Add Custom Chore';
        document.getElementById('saveChoreBtn').textContent = 'Save Chore';
        document.getElementById('addChoreModal').style.display = 'block';
        // Focus on name input
        setTimeout(() => {
            document.getElementById('choreNameInput').focus();
        }, 100);
    }
    
    closeAddChoreModal() {
        document.getElementById('addChoreModal').style.display = 'none';
        document.getElementById('choreNameInput').value = '';
        document.getElementById('choreTimeInput').value = '5'; // Reset to default (5 minutes)
        this.editingChoreId = null;
    }
    
    saveNewChore() {
        const name = document.getElementById('choreNameInput').value.trim();
        const time = parseInt(document.getElementById('choreTimeInput').value);
        
        if (!name) {
            alert('Please enter a chore name');
            return;
        }
        
        // Time is from dropdown, so it's always valid (5, 10, 15, 30, or 60)
        
        if (this.editingChoreId) {
            // Editing existing chore
            const choreIndex = this.customChores.findIndex(c => c.id === this.editingChoreId);
            if (choreIndex === -1) return;
            
            // Check if name changed and conflicts with another chore
            const existingChore = this.customChores[choreIndex];
            if (existingChore.name.toLowerCase() !== name.toLowerCase()) {
                if (this.customChores.some(chore => chore.id !== this.editingChoreId && chore.name.toLowerCase() === name.toLowerCase())) {
                    alert('A chore with this name already exists');
                    return;
                }
            }
            
            // Update the chore
            this.customChores[choreIndex].name = name;
            this.customChores[choreIndex].time = time;
            this.updateChoresList();
            this.saveCustomChores();
            this.renderChores();
            this.closeAddChoreModal();
            
            // Show success feedback
            const saveBtn = document.getElementById('saveChoreBtn');
            const originalText = saveBtn.textContent;
            saveBtn.textContent = '✓ Updated!';
            setTimeout(() => {
                saveBtn.textContent = originalText;
            }, 2000);
        } else {
            // Adding new chore
            // Check if chore with same name already exists
            if (this.customChores.some(chore => chore.name.toLowerCase() === name.toLowerCase())) {
                alert('A chore with this name already exists');
                return;
            }
            
            // Add new custom chore
            const newChore = {
                name: name,
                time: time,
                id: Date.now().toString() // Unique ID for the chore
            };
            
            this.customChores.push(newChore);
            this.updateChoresList();
            this.saveCustomChores();
            
            // Refresh the chores display
            this.renderChores();
            
            // Close modal
            this.closeAddChoreModal();
            
            // Show success feedback
            const saveBtn = document.getElementById('saveChoreBtn');
            const originalText = saveBtn.textContent;
            saveBtn.textContent = '✓ Saved!';
            setTimeout(() => {
                saveBtn.textContent = originalText;
            }, 2000);
        }
    }
    
    updateAmountDisplay() {
        const amount = this.currentAmount;
        let displayText;
        
        if (amount === 0) {
            displayText = '0';
        } else if (amount > 0) {
            // Positive amounts (for adding)
            displayText = amount === 60 ? '+1 hour' : `+${amount} min`;
        } else {
            // Negative amounts (for subtracting)
            const absAmount = Math.abs(amount);
            displayText = absAmount === 60 ? '-1 hour' : `-${absAmount} min`;
        }
        
        document.getElementById('selectedAmount').textContent = displayText;
        
        // Update modal display after adjustment
        if (this.currentChildId) {
            const child = this.children.find(c => c.id === this.currentChildId);
            if (child) {
                document.getElementById('modalCurrentTime').textContent = this.formatTime(child.timeBalance);
            }
        }
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

// Update Manager Class
class UpdateManager {
    constructor() {
        this.registration = null;
        this.updateAvailable = false;
        this.checkingForUpdate = false;
        this.setupUI();
    }
    
    setupUI() {
        // Setup update banner buttons (use event delegation since elements are created dynamically)
        document.body.addEventListener('click', (e) => {
            if (e.target.id === 'updateNowBtn') {
                this.applyUpdate();
            } else if (e.target.id === 'updateLaterBtn') {
                this.hideUpdateBanner();
            }
        });
        
        // Setup settings button
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.openSettings());
        }
        
        // Setup check for updates button in settings
        const checkUpdateBtn = document.getElementById('checkUpdateBtn');
        if (checkUpdateBtn) {
            checkUpdateBtn.addEventListener('click', () => this.checkForUpdate());
        }
        
        // Setup close settings modal
        const closeSettingsModal = document.getElementById('closeSettingsModal');
        const settingsModal = document.getElementById('settingsModal');
        if (closeSettingsModal && settingsModal) {
            closeSettingsModal.addEventListener('click', () => this.closeSettings());
            settingsModal.addEventListener('click', (e) => {
                if (e.target === settingsModal) {
                    this.closeSettings();
                }
            });
        }
    }
    
    async registerServiceWorker() {
        if (!('serviceWorker' in navigator) || window.location.protocol === 'file:') {
            console.log('Service Workers not supported or file protocol');
            return;
        }
        
        try {
            this.registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
            console.log('Service Worker registered:', this.registration);
            
            // Check for updates immediately
            await this.checkForUpdate();
            
            // Listen for service worker updates
            this.registration.addEventListener('updatefound', () => {
                console.log('Service Worker update found');
                this.handleUpdateFound();
            });
            
            // Check for updates periodically (every 5 minutes)
            setInterval(() => this.checkForUpdate(), 5 * 60 * 1000);
            
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }
    
    async checkForUpdate() {
        if (this.checkingForUpdate || !this.registration) return;
        
        this.checkingForUpdate = true;
        const checkBtn = document.getElementById('checkUpdateBtn');
        const updateBtnText = document.getElementById('updateBtnText');
        const updateStatusText = document.getElementById('updateStatusText');
        
        if (checkBtn) {
            checkBtn.disabled = true;
        }
        if (updateBtnText) {
            updateBtnText.textContent = '⏳ Checking...';
        }
        if (updateStatusText) {
            updateStatusText.textContent = '';
        }
        
        try {
            // Force update check
            await this.registration.update();
            
            // Check if there's a waiting service worker
            if (this.registration.waiting) {
                this.updateAvailable = true;
                this.showUpdateBanner();
                if (updateStatusText) {
                    updateStatusText.textContent = 'Update available! See banner at top.';
                    updateStatusText.style.color = 'var(--primary-color)';
                }
            } else {
                // Check if there's an installing service worker
                if (this.registration.installing) {
                    this.handleUpdateFound();
                } else {
                    console.log('No updates available');
                    if (updateBtnText) {
                        updateBtnText.textContent = '✅ Up to date';
                    }
                    if (updateStatusText) {
                        updateStatusText.textContent = 'You have the latest version.';
                        updateStatusText.style.color = 'var(--text-secondary)';
                    }
                    setTimeout(() => {
                        if (updateBtnText) {
                            updateBtnText.textContent = '🔄 Check for Updates';
                        }
                        if (checkBtn) {
                            checkBtn.disabled = false;
                        }
                        if (updateStatusText) {
                            updateStatusText.textContent = '';
                        }
                    }, 2000);
                }
            }
        } catch (error) {
            console.error('Error checking for updates:', error);
            if (updateBtnText) {
                updateBtnText.textContent = '❌ Error';
            }
            if (updateStatusText) {
                updateStatusText.textContent = 'Failed to check for updates.';
                updateStatusText.style.color = 'var(--primary-color)';
            }
            setTimeout(() => {
                if (updateBtnText) {
                    updateBtnText.textContent = '🔄 Check for Updates';
                }
                if (checkBtn) {
                    checkBtn.disabled = false;
                }
                if (updateStatusText) {
                    updateStatusText.textContent = '';
                }
            }, 2000);
        } finally {
            this.checkingForUpdate = false;
        }
    }
    
    handleUpdateFound() {
        const installingWorker = this.registration.installing;
        if (!installingWorker) return;
        
        installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                    // New service worker is waiting
                    this.updateAvailable = true;
                    this.showUpdateBanner();
                } else {
                    // First time install
                    console.log('Service Worker installed for the first time');
                }
            }
        });
    }
    
    showUpdateBanner() {
        const banner = document.getElementById('updateBanner');
        if (banner) {
            banner.classList.remove('hidden');
        }
        const updateBtnText = document.getElementById('updateBtnText');
        if (updateBtnText) {
            updateBtnText.textContent = '🔄 Update Available';
        }
        const checkBtn = document.getElementById('checkUpdateBtn');
        if (checkBtn) {
            checkBtn.disabled = false;
        }
    }
    
    hideUpdateBanner() {
        const banner = document.getElementById('updateBanner');
        if (banner) {
            banner.classList.add('hidden');
        }
    }
    
    async applyUpdate() {
        try {
            // Clear all caches first to ensure fresh files are loaded
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames.map(cacheName => {
                    console.log('Deleting cache:', cacheName);
                    return caches.delete(cacheName);
                })
            );
            
            // Unregister all service workers
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(
                registrations.map(registration => {
                    console.log('Unregistering service worker');
                    return registration.unregister();
                })
            );
            
            // If there's a waiting worker, tell it to skip waiting
            if (this.registration && this.registration.waiting) {
                this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            
            // Force reload with cache bypass (use timestamp to bust cache)
            window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
        } catch (error) {
            console.error('Error applying update:', error);
            // Fallback: reload with cache bypass
            window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
        }
    }
    
    async loadVersion() {
        const versionText = document.getElementById('versionText');
        if (!versionText) return;
        
        try {
            // Get version from cache name (most reliable method)
            const cacheNames = await caches.keys();
            const currentCache = cacheNames.find(name => name.startsWith('tv-time-manager-'));
            if (currentCache) {
                const version = currentCache.replace('tv-time-manager-', '');
                versionText.textContent = `App Version: ${version}`;
            } else {
                // Try to get from service worker if available
                if (this.registration && this.registration.active) {
                    // Fetch the service worker script and extract version
                    try {
                        const swResponse = await fetch('./service-worker.js?t=' + Date.now());
                        const swText = await swResponse.text();
                        const versionMatch = swText.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
                        if (versionMatch) {
                            versionText.textContent = `App Version: ${versionMatch[1]}`;
                        } else {
                            versionText.textContent = 'App Version: Unknown';
                        }
                    } catch (e) {
                        versionText.textContent = 'App Version: Not installed';
                    }
                } else {
                    versionText.textContent = 'App Version: Not installed';
                }
            }
        } catch (error) {
            console.error('Error loading version:', error);
            versionText.textContent = 'App Version: Error';
        }
    }
    
    openSettings() {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            modal.style.display = 'block';
            // Load version when opening settings
            this.loadVersion();
        }
    }
    
    closeSettings() {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }
}

// Initialize Update Manager
let updateManager = null;
if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
    window.addEventListener('load', () => {
        updateManager = new UpdateManager();
        window.updateManager = updateManager; // Make it globally accessible
        updateManager.registerServiceWorker();
    });
}

// Suppress harmless browser extension errors in console
window.addEventListener('error', (event) => {
    if (event.message && event.message.includes('message channel closed')) {
        event.preventDefault();
        return false;
    }
}, true);

