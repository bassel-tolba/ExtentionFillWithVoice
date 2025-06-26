// Global variables for recording & image
let mediaRecorder,
	audioChunks = [],
	isRecording = false,
	recordedAudioBase64 = null,
	recordedAudioMimeType = null,
	currentAudioStream = null,
	actualMimeTypeFromRecorder = "";
let recordedImageDataUrlBase64 = null,
	recordedImageMimeType = null;

// Global variables for form selection & state
let manuallySelectedFormId = null;
let isFormSelectionModePopupActive = false;
let currentPendingAIDataForFill = null;
let lastFillSuccessful = false;

document.addEventListener("DOMContentLoaded", () => {
	// --- DOM Elements ---
	const themeToggler = document.getElementById("themeToggler");
	const themeIconLight = document.getElementById("themeIconLight");
	const themeIconDark = document.getElementById("themeIconDark");

	// API Key Elements (example)
	const apiKeyInput = document.getElementById("apiKeyInput");
	const saveApiKeyButton = document.getElementById("saveApiKeyButton");
	const apiKeyStatus = document.getElementById("apiKeyStatus");
	// const apiKeySection = document.getElementById("apiKeySection"); // To show/hide

	const recordButton = document.getElementById("recordButton"),
		recordButtonText = recordButton.querySelector("span");
	const recordingStatusDiv = document.getElementById("recordingStatus");
	const userRequestTextarea = document.getElementById("userRequest");
	const processFormsButton = document.getElementById("processForms"),
		processFormsButtonText = processFormsButton.querySelector(".button-text"),
		processFormsButtonSpinner = processFormsButton.querySelector(".spinner");
	const geminiOutputDiv = document.getElementById("geminiOutput");
	const formsFoundDiv = document.getElementById("formsFound"); // This is the content div
	const imageUploadInput = document.getElementById("imageUpload"),
		imageStatusDiv = document.getElementById("imageStatus"),
		imagePreviewContainer = document.getElementById("imagePreviewContainer"),
		clearImageButton = document.getElementById("clearImageButton");
	const resultsLoaderOverlay = document.querySelector(".results-loader-overlay"),
		loaderStatusText = document.getElementById("loaderStatusText");
	const resultsContent = document.querySelector(".results-content");
	const selectFormButton = document.getElementById("selectFormButton"),
		selectFormButtonText = selectFormButton.querySelector("span"),
		selectedFormDisplay = document.getElementById("selectedFormDisplay");
	const fillConfirmationSection = document.getElementById("fillConfirmationSection");
	const fillConfirmationMessage = document.getElementById("fillConfirmationMessage");
	const confirmFillButton = document.getElementById("confirmFillButton");
	const cancelPreviewButton = document.getElementById("cancelPreviewButton");
	const undoFillButton = document.getElementById("undoFillButton");
	const fillOperationStatusContainer = document.getElementById("fillOperationStatusContainer");

	// Collapsible section elements
	const toggleGeminiOutputButton = document.getElementById("toggleGeminiOutput");
	const geminiOutputContainer = document.getElementById("geminiOutputContainer");
	const toggleFormsFoundButton = document.getElementById("toggleFormsFound");
	// formsFoundDiv is already defined as the content area for forms

	// --- Initial UI Setup ---
	clearImagePreviewDOM();
	clearAudioPlayer();
	updateSelectedFormDisplay();
	undoFillButton.disabled = true;
	undoFillButton.style.display = "none";
	setupCollapsibleSections();
	loadAndSetTheme(); // Load and set theme first
	loadApiKey(); // Load API key if using popup method

	// --- Event Listeners ---
	themeToggler.addEventListener("click", toggleTheme);
	if (saveApiKeyButton) saveApiKeyButton.addEventListener("click", saveApiKey);

	recordButton.addEventListener("click", toggleRecording);
	imageUploadInput.addEventListener("change", handleImageUpload);
	clearImageButton.addEventListener("click", clearImage);
	processFormsButton.addEventListener("click", handleProcessForms);
	selectFormButton.addEventListener("click", toggleFormSelectionMode);
	confirmFillButton.addEventListener("click", executeConfirmedFill);
	cancelPreviewButton.addEventListener("click", cancelAIFillPreview);
	undoFillButton.addEventListener("click", handleUndoFill);

	// --- Theme Handling ---
	function setTheme(theme) {
		if (theme === "dark") {
			document.body.classList.add("dark-mode");
			if (themeIconLight) themeIconLight.style.display = "none";
			if (themeIconDark) themeIconDark.style.display = "block";
		} else {
			document.body.classList.remove("dark-mode");
			if (themeIconLight) themeIconLight.style.display = "block";
			if (themeIconDark) themeIconDark.style.display = "none";
		}
	}

	function loadAndSetTheme() {
		chrome.storage.local.get("theme", (data) => {
			setTheme(data.theme || "light"); // Default to light
		});
	}

	function toggleTheme() {
		const currentTheme = document.body.classList.contains("dark-mode") ? "dark" : "light";
		const newTheme = currentTheme === "dark" ? "light" : "dark";
		setTheme(newTheme);
		chrome.storage.local.set({ theme: newTheme });
	}

	// --- API Key Handling (Example for popup method) ---
	function saveApiKey() {
		if (!apiKeyInput || !apiKeyStatus) return;
		const key = apiKeyInput.value.trim();
		if (key) {
			chrome.storage.local.set({ geminiApiKey: key }, () => {
				showStatusMessage(apiKeyStatus, "API Key saved!", "success");
				setTimeout(() => clearStatusMessage(apiKeyStatus), 3000);
			});
		} else {
			showStatusMessage(apiKeyStatus, "Please enter an API Key.", "error");
		}
	}

	function loadApiKey() {
		if (!apiKeyInput || !apiKeyStatus) return;
		chrome.storage.local.get("geminiApiKey", (result) => {
			if (result.geminiApiKey) {
				apiKeyInput.value = result.geminiApiKey;
				// showStatusMessage(apiKeyStatus, "API Key loaded.", "info");
				// setTimeout(() => clearStatusMessage(apiKeyStatus), 2000);
				// apiKeySection.style.display = "none"; // Hide if key exists
			} else {
				showStatusMessage(apiKeyStatus, "API Key not set. Please save.", "warning", 0);
				// apiKeySection.style.display = "block"; // Show if key doesn't exist
			}
		});
	}
	// To show API key section if needed, call this:
	// if (apiKeySection) apiKeySection.style.display = 'block';

	// --- Collapsible Sections ---
	function setupCollapsibleSections() {
		const collapsibles = [
			{ button: toggleGeminiOutputButton, content: geminiOutputContainer, openByDefault: false },
			{ button: toggleFormsFoundButton, content: formsFoundDiv, openByDefault: false },
		];

		collapsibles.forEach((coll) => {
			if (coll.button && coll.content) {
				const icon = coll.button.querySelector(".toggle-icon");

				const setSectionState = (isOpen) => {
					coll.content.style.display = isOpen ? "block" : "none";
					if (icon) {
						icon.textContent = isOpen ? "-" : "+";
						icon.classList.toggle("open", isOpen);
					}
					// Optional: Store preference
					// chrome.storage.local.set({ [`collapsible-${coll.content.id}`]: isOpen });
				};

				// Load preference or set default
				// chrome.storage.local.get([`collapsible-${coll.content.id}`], (result) => {
				//    const storedState = result[`collapsible-${coll.content.id}`];
				//    setSectionState(typeof storedState === 'boolean' ? storedState : coll.openByDefault);
				// });

				setSectionState(coll.openByDefault); // Set initial state

				coll.button.addEventListener("click", () => {
					const isHidden = coll.content.style.display === "none";
					setSectionState(isHidden);
				});
			}
		});
	}

	// --- Status/UI Helpers ---
	function showStatusMessage(element, message, type = "info", duration = 5000) {
		if (!element) return;
		element.textContent = message;
		element.className = `status-message ${type} visible`;
		if (type === "recording" && message.toLowerCase().includes("recording")) {
			element.innerHTML = `<span class="pulsing-dot"></span> ${message}`;
		}
		if (duration > 0) {
			setTimeout(() => {
				// Check if the message is still the same to avoid clearing a new message
				if (element.textContent === message && element.classList.contains(type)) {
					clearStatusMessage(element);
				}
			}, duration);
		}
	}
	function clearStatusMessage(element) {
		if (!element) return;
		element.textContent = "";
		element.className = "status-message";
	}
	function updateLoaderStatus(text) {
		loaderStatusText.textContent = text;
	}
	function showGeneralPopupMessage(message, type = "info", duration = 5000) {
		fillOperationStatusContainer.innerHTML = ""; // Clear previous
		const p = document.createElement("p");
		p.textContent = message;
		p.className = type; // Class should match one of success, error, warning, info
		fillOperationStatusContainer.appendChild(p);
		fillOperationStatusContainer.style.display = "block";

		if (duration > 0) {
			setTimeout(() => {
				if (p.parentNode === fillOperationStatusContainer) {
					fillOperationStatusContainer.removeChild(p);
					if (fillOperationStatusContainer.children.length === 0) {
						fillOperationStatusContainer.style.display = "none";
					}
				}
			}, duration);
		}
	}

	// --- Form Selection Logic ---
	function updateSelectedFormDisplay() {
		if (isFormSelectionModePopupActive) {
			selectedFormDisplay.textContent = "Click element on page...";
			selectedFormDisplay.className = "status-like-display selecting";
		} else if (manuallySelectedFormId) {
			selectedFormDisplay.textContent = `Selected: ${manuallySelectedFormId}`;
			selectedFormDisplay.className = "status-like-display selected";
		} else {
			selectedFormDisplay.textContent = "No form selected.";
			selectedFormDisplay.className = "status-like-display";
		}
	}
	function getActiveTabId(callback) {
		chrome.windows.getLastFocused({ populate: true, windowTypes: ["normal", "panel"] }, (lastFocusedWindow) => {
			if (chrome.runtime.lastError || !lastFocusedWindow) {
				console.error("POPUP: Error getting last focused window:", chrome.runtime.lastError?.message);
				callback(null);
				return;
			}
			const targetTab = lastFocusedWindow.tabs.find((t) => t.active);
			if (!targetTab || !targetTab.id) {
				console.error("POPUP: Could not find an active tab.");
				callback(null);
				return;
			}
			if (
				targetTab.url &&
				(targetTab.url.startsWith("chrome://") || targetTab.url.startsWith("edge://") || targetTab.url.startsWith(chrome.runtime.getURL("")))
			) {
				handleErrorInUI("Cannot interact with this type of page. Please select a regular web page.", "Action not allowed.");
				callback(null);
				return;
			}
			callback(targetTab.id);
		});
	}
	function toggleFormSelectionMode() {
		if (isFormSelectionModePopupActive) {
			getActiveTabId((tabId) => {
				if (tabId)
					chrome.tabs.sendMessage(tabId, { action: "cancelFormSelectionMode" }, () => exitFormSelectionModeUI("Cancelled from popup."));
				else exitFormSelectionModeUI("No active tab to cancel on.");
			});
		} else {
			getActiveTabId((tabId) => {
				if (!tabId) {
					handleErrorInUI("Cannot start form selection: No active tab found.", "Error: No active tab.");
					return;
				}
				chrome.scripting.executeScript({ target: { tabId: tabId }, files: ["content.js"] }, () => {
					if (chrome.runtime.lastError) {
						handleErrorInUI(
							`Error preparing page for selection: ${chrome.runtime.lastError.message}.`,
							"Error: Script injection failed."
						);
						return;
					}
					chrome.tabs.sendMessage(tabId, { action: "extractForms" }, (formsDataResponse) => {
						if (chrome.runtime.lastError || !formsDataResponse) {
							handleErrorInUI(`Failed to prepare forms on page. Try refreshing.`, "Error: Page form preparation failed.");
							return;
						}
						chrome.tabs.sendMessage(tabId, { action: "startFormSelectionMode" }, (response) => {
							if (chrome.runtime.lastError || !(response && response.status === "listening")) {
								handleErrorInUI("Failed to activate form selection on page.", "Error: Page communication failed.");
								return;
							}
							enterFormSelectionModeUI();
						});
					});
				});
			});
		}
	}
	function enterFormSelectionModeUI() {
		isFormSelectionModePopupActive = true;
		document.body.classList.add("selecting-form"); // For popup-specific styling during selection
		selectFormButtonText.textContent = "Cancel Selection";
		updateSelectedFormDisplay();
	}
	function exitFormSelectionModeUI(reason = "") {
		isFormSelectionModePopupActive = false;
		document.body.classList.remove("selecting-form");
		selectFormButtonText.textContent = "Select Form on Page";
		if (reason && !manuallySelectedFormId) selectedFormDisplay.textContent = reason;
		updateSelectedFormDisplay();
	}
	chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
		if (request.action === "formSelectedByContentScript") {
			manuallySelectedFormId = request.formId;
			exitFormSelectionModeUI(request.formId ? "" : "Selection failed on page.");
			sendResponse({ status: "Popup acknowledged" });
		} else if (request.action === "formSelectionCancelledByContentScript") {
			manuallySelectedFormId = null;
			exitFormSelectionModeUI("Selection cancelled on page.");
			sendResponse({ status: "Popup acknowledged cancellation" });
		}
		return true;
	});

	// --- Image Handling ---
	function handleImageUpload(event) {
		const file = event.target.files[0];
		if (!file) {
			clearStatusMessage(imageStatusDiv);
			return;
		}
		const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
		if (!allowedTypes.includes(file.type)) {
			showStatusMessage(imageStatusDiv, "Error: Invalid file type. Use PNG, JPEG, or WEBP.", "error");
			imageUploadInput.value = "";
			return;
		}
		showStatusMessage(imageStatusDiv, "Processing image...", "info");
		imagePreviewContainer.classList.remove("has-image");
		compressAndStoreImage(file);
	}
	async function compressAndStoreImage(file) {
		clearImageButton.style.display = "none";
		clearImagePreviewDOM();
		recordedImageDataUrlBase64 = null;
		recordedImageMimeType = null;
		try {
			const reader = new FileReader();
			reader.onload = (e_reader) => {
				try {
					const img = new Image();
					img.onload = () => {
						try {
							const MAX_DIMENSION = 1536;
							let canvas = document.createElement("canvas");
							let ctx = canvas.getContext("2d");
							let width = img.width;
							let height = img.height;
							if (width === 0 || height === 0) {
								showStatusMessage(imageStatusDiv, "Error: Image has invalid dimensions.", "error");
								imageUploadInput.value = "";
								return;
							}
							if (width > height) {
								if (width > MAX_DIMENSION) {
									height = Math.round((height * MAX_DIMENSION) / width);
									width = MAX_DIMENSION;
								}
							} else {
								if (height > MAX_DIMENSION) {
									width = Math.round((width * MAX_DIMENSION) / height);
									height = MAX_DIMENSION;
								}
							}
							if (width <= 0 || height <= 0) {
								showStatusMessage(imageStatusDiv, "Error: Image resizing resulted in invalid dimensions.", "error");
								imageUploadInput.value = "";
								return;
							}
							canvas.width = width;
							canvas.height = height;
							ctx.drawImage(img, 0, 0, width, height);
							const outputMimeType = "image/jpeg";
							const dataUrl = canvas.toDataURL(outputMimeType, 0.8);
							if (!dataUrl || dataUrl === "data:," || dataUrl.length < 100) {
								showStatusMessage(imageStatusDiv, "Error: Could not convert image.", "error");
								imageUploadInput.value = "";
								return;
							}
							const parts = dataUrl.split(",");
							if (parts.length < 2 || !parts[1]) {
								showStatusMessage(imageStatusDiv, "Error: Failed to process image data.", "error");
								imageUploadInput.value = "";
								return;
							}
							const base64Data = parts[1];
							const approxSizeBytes = base64Data.length * 0.75;
							const approxSizeMB = approxSizeBytes / (1024 * 1024);
							const MAX_BASE64_SIZE_BYTES = 4 * 1024 * 1024 * 0.95;
							if (approxSizeBytes > MAX_BASE64_SIZE_BYTES) {
								showStatusMessage(imageStatusDiv, `Error: Image too large (${approxSizeMB.toFixed(1)}MB). Max ~3.8MB.`, "error");
								imageUploadInput.value = "";
								return;
							}
							recordedImageDataUrlBase64 = base64Data;
							recordedImageMimeType = outputMimeType;
							displayImagePreviewDOM(dataUrl);
							showStatusMessage(imageStatusDiv, `Image ready (${approxSizeMB.toFixed(2)}MB).`, "success");
							clearImageButton.style.display = "flex";
							imagePreviewContainer.classList.add("has-image");
						} catch (imgLoadError) {
							showStatusMessage(imageStatusDiv, "Error: Failed during image processing.", "error");
							imageUploadInput.value = "";
							console.error("POPUP ImgLoadError:", imgLoadError);
						}
					};
					img.onerror = () => {
						showStatusMessage(imageStatusDiv, "Error: Could not load image file.", "error");
						imageUploadInput.value = "";
						console.error("POPUP Img.onerror");
					};
					if (e_reader.target && typeof e_reader.target.result === "string") img.src = e_reader.target.result;
					else {
						showStatusMessage(imageStatusDiv, "Error: FileReader invalid result.", "error");
						imageUploadInput.value = "";
						console.error("POPUP FileReader invalid result");
					}
				} catch (readerLoadError) {
					showStatusMessage(imageStatusDiv, "Error: Failed after reading image file.", "error");
					imageUploadInput.value = "";
					console.error("POPUP ReaderLoadError:", readerLoadError);
				}
			};
			reader.onerror = () => {
				showStatusMessage(imageStatusDiv, "Error reading the selected file.", "error");
				imageUploadInput.value = "";
				console.error("POPUP Reader.onerror");
			};
			reader.readAsDataURL(file);
		} catch (outerError) {
			showStatusMessage(imageStatusDiv, "Error: Issue initiating image processing.", "error");
			imageUploadInput.value = "";
			console.error("POPUP OuterError compress:", outerError);
		}
	}
	function displayImagePreviewDOM(dataUrl) {
		clearImagePreviewDOM(); // Clears placeholder too
		const imgElement = document.createElement("img");
		imgElement.src = dataUrl;
		imagePreviewContainer.appendChild(imgElement);
		imagePreviewContainer.classList.add("has-image");
	}
	function clearImagePreviewDOM() {
		const placeholder = imagePreviewContainer.querySelector(".image-placeholder");
		imagePreviewContainer.innerHTML = ""; // Clear existing image
		if (placeholder) imagePreviewContainer.appendChild(placeholder.cloneNode(true)); // Re-add placeholder
		imagePreviewContainer.classList.remove("has-image");
	}
	function clearImage() {
		recordedImageDataUrlBase64 = null;
		recordedImageMimeType = null;
		imageUploadInput.value = "";
		clearImagePreviewDOM();
		clearStatusMessage(imageStatusDiv);
		clearImageButton.style.display = "none";
	}

	// --- Audio Handling ---
	async function toggleRecording() {
		if (!isRecording) {
			try {
				currentAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
				const preferredMimeTypes = ["audio/ogg; codecs=opus", "audio/mp3", "audio/wav", "audio/webm; codecs=opus", "audio/webm"];
				let options = {};
				for (const mimeType of preferredMimeTypes) {
					if (MediaRecorder.isTypeSupported(mimeType)) {
						options.mimeType = mimeType;
						break;
					}
				}
				mediaRecorder = new MediaRecorder(currentAudioStream, options);
				actualMimeTypeFromRecorder = mediaRecorder.mimeType || "";
				mediaRecorder.onstart = () => {
					recordButtonText.textContent = "Stop Recording";
					recordButton.classList.add("is-recording");
					showStatusMessage(recordingStatusDiv, "Recording...", "recording");
					isRecording = true;
					audioChunks = [];
					recordedAudioBase64 = null;
					recordedAudioMimeType = null;
					clearAudioPlayer();
				};
				mediaRecorder.ondataavailable = (event) => {
					if (event.data.size > 0) audioChunks.push(event.data);
				};
				mediaRecorder.onstop = () => {
					recordButtonText.textContent = "Start Recording";
					recordButton.classList.remove("is-recording");
					isRecording = false;
					if (currentAudioStream) currentAudioStream.getTracks().forEach((track) => track.stop());
					currentAudioStream = null;
					if (audioChunks.length === 0) {
						showStatusMessage(recordingStatusDiv, "No audio data captured.", "error");
						clearAudioPlayer();
						return;
					}
					let blobCreationMimeType = actualMimeTypeFromRecorder || "audio/webm";
					const audioBlob = new Blob(audioChunks, { type: blobCreationMimeType });
					audioChunks = [];
					if (audioBlob.size === 0) {
						showStatusMessage(recordingStatusDiv, "No audio recorded (empty blob).", "error");
						clearAudioPlayer();
						return;
					}
					recordedAudioMimeType = audioBlob.type || blobCreationMimeType;
					const baseMimeType = recordedAudioMimeType.split(";")[0];
					const supportedGeminiBaseTypes = ["audio/wav", "audio/mp3", "audio/aiff", "audio/aac", "audio/ogg", "audio/flac"];
					if (!supportedGeminiBaseTypes.includes(baseMimeType) && baseMimeType === "audio/webm") recordedAudioMimeType = "audio/ogg";
					else if (!supportedGeminiBaseTypes.includes(baseMimeType))
						showStatusMessage(
							recordingStatusDiv,
							`Audio type ${baseMimeType} might not be optimal. Trying as ${recordedAudioMimeType}.`,
							"info"
						);

					showStatusMessage(recordingStatusDiv, "Processing audio...", "info");
					createAudioPlayer(audioBlob);
					const reader = new FileReader();
					reader.onloadend = () => {
						const result = reader.result;
						if (typeof result === "string") {
							const parts = result.split(",");
							if (parts.length > 1 && parts[1]) {
								recordedAudioBase64 = parts[1];
								showStatusMessage(recordingStatusDiv, `Audio ready! (Type: ${recordedAudioMimeType.split(";")[0]})`, "success");
							} else {
								showStatusMessage(recordingStatusDiv, "Error processing audio data (Base64).", "error");
								clearAudioPlayer();
							}
						} else {
							showStatusMessage(recordingStatusDiv, "Error: FileReader did not return string.", "error");
							clearAudioPlayer();
						}
					};
					reader.onerror = () => {
						showStatusMessage(recordingStatusDiv, "Error reading audio file.", "error");
						clearAudioPlayer();
					};
					reader.readAsDataURL(audioBlob);
				};
				mediaRecorder.start();
			} catch (err) {
				showStatusMessage(recordingStatusDiv, `Mic error: ${err.name || err.message}`, "error");
				if (currentAudioStream) currentAudioStream.getTracks().forEach((track) => track.stop());
				currentAudioStream = null;
				console.error("POPUP Mic Error:", err);
				recordButtonText.textContent = "Start Recording";
				recordButton.classList.remove("is-recording");
				isRecording = false;
			}
		} else {
			if (mediaRecorder && mediaRecorder.state === "recording") {
				mediaRecorder.stop();
			} else {
				recordButtonText.textContent = "Start Recording";
				recordButton.classList.remove("is-recording");
				isRecording = false;
				if (currentAudioStream) currentAudioStream.getTracks().forEach((track) => track.stop());
				currentAudioStream = null;
				showStatusMessage(recordingStatusDiv, "Stopped recording.", "info");
			}
		}
	}
	function createAudioPlayer(audioBlob) {
		clearAudioPlayer();
		if (audioBlob && audioBlob.size > 0) {
			const audioUrl = URL.createObjectURL(audioBlob);
			const audioElement = document.createElement("audio");
			audioElement.controls = true;
			audioElement.src = audioUrl;
			document.getElementById("audioPlayerContainer").appendChild(audioElement);
		}
	}
	function clearAudioPlayer() {
		const playerContainer = document.getElementById("audioPlayerContainer");
		const existingAudio = playerContainer.querySelector("audio");
		if (existingAudio && existingAudio.src && existingAudio.src.startsWith("blob:")) URL.revokeObjectURL(existingAudio.src);
		playerContainer.innerHTML = "";
	}

	// --- Main Processing Logic ---
	function setProcessingState(isProcessing, statusText = "AI is thinking...") {
		processFormsButton.disabled = isProcessing;
		selectFormButton.disabled = isProcessing;
		recordButton.disabled = isProcessing;
		imageUploadInput.disabled = isProcessing;
		userRequestTextarea.disabled = isProcessing;
		if (clearImageButton) clearImageButton.disabled = isProcessing;

		processFormsButton.classList.toggle("is-loading", isProcessing);
		processFormsButtonText.textContent = isProcessing ? "Processing..." : "Process with AI";
		if (processFormsButtonSpinner) processFormsButtonSpinner.style.display = isProcessing ? "inline-block" : "none";

		if (isProcessing) {
			updateLoaderStatus(statusText);
			resultsLoaderOverlay.classList.add("visible");
			resultsContent.classList.add("loading");
			fillConfirmationSection.style.display = "none";
			undoFillButton.disabled = true;
		} else {
			resultsLoaderOverlay.classList.remove("visible");
			resultsContent.classList.remove("loading");
			undoFillButton.disabled = !lastFillSuccessful;
		}
	}

	function handleProcessForms() {
		const userRequest = userRequestTextarea.value.trim();
		formsFoundDiv.innerHTML = ""; // Clear previous forms list
		geminiOutputDiv.textContent = "";
		geminiOutputDiv.className = "";
		fillOperationStatusContainer.innerHTML = "";
		fillOperationStatusContainer.style.display = "none";
		fillConfirmationSection.style.display = "none";
		currentPendingAIDataForFill = null;
		lastFillSuccessful = false;
		undoFillButton.disabled = true;
		undoFillButton.style.display = "none";

		let processingMessageParts = [];
		if (manuallySelectedFormId) processingMessageParts.push(`selected form`); // (${manuallySelectedFormId})
		if (recordedImageDataUrlBase64) processingMessageParts.push("image");
		if (recordedAudioBase64) processingMessageParts.push("audio");
		if (userRequest !== "") processingMessageParts.push("text");

		if (processingMessageParts.length === 0 && !manuallySelectedFormId) {
			handleErrorInUI("Please provide input (type, record audio, upload image, or select a form).", "No input provided.");
			return;
		}
		if (processingMessageParts.length === 0 && manuallySelectedFormId && !userRequest && !recordedAudioBase64 && !recordedImageDataUrlBase64) {
			handleErrorInUI("Form selected, but no text, audio, or image provided to fill it.", "Input missing for selected form.");
			return;
		}

		setProcessingState(true, "Preparing...");
		geminiOutputDiv.textContent = `Starting process with ${processingMessageParts.join(", ")}...`;
		geminiOutputDiv.className = "info-message";
		if (geminiOutputContainer.style.display === "none") toggleGeminiOutputButton.click(); // Open if closed

		getActiveTabId((tabId) => {
			if (!tabId) {
				setProcessingState(false);
				return;
			}
			setProcessingState(true, "Accessing page content...");
			chrome.scripting.executeScript({ target: { tabId: tabId }, files: ["content.js"] }, () => {
				if (chrome.runtime.lastError) {
					handleErrorInUI(`Error injecting script: ${chrome.runtime.lastError.message}.`, "Error: Script injection failed.");
					setProcessingState(false);
					return;
				}
				setProcessingState(true, "Extracting forms from page...");
				chrome.tabs.sendMessage(tabId, { action: "extractForms" }, (formsDataResponse) => {
					if (chrome.runtime.lastError) {
						handleErrorInUI(`Error getting forms: ${chrome.runtime.lastError.message}. Try refreshing.`, "Error: No response from page.");
						setProcessingState(false);
						return;
					}
					const formsData = formsDataResponse || [];
					displayFormsFound(formsData); // Display forms found
					if (formsData.length > 0 && formsFoundDiv.style.display === "none") {
						if (toggleFormsFoundButton) toggleFormsFoundButton.click(); // Open forms list if closed and has forms
					}

					const messageToBackground = {
						action: "processWithGemini",
						formsData,
						userRequest,
						selectedFormId: manuallySelectedFormId,
						audioData: recordedAudioBase64,
						audioMimeType: recordedAudioMimeType,
						imageData: recordedImageDataUrlBase64,
						imageMimeType: recordedImageMimeType,
					};
					setProcessingState(true, "Sending to AI...");
					geminiOutputDiv.textContent = "Data sent to AI. Waiting for response...";
					geminiOutputDiv.className = "info-message";
					chrome.runtime.sendMessage(messageToBackground, (response) => {
						if (chrome.runtime.lastError) {
							handleErrorInUI("Error communicating with AI service.", `AI Comms Error: ${chrome.runtime.lastError.message}`);
							setProcessingState(false);
							return;
						}
						handleAIResponseForPreview(response, tabId);
					});
				});
			});
		});
	}

	function handleAIResponseForPreview(response, tabId) {
		if (response && response.error) {
			geminiOutputDiv.textContent = "AI Error: " + response.error;
			geminiOutputDiv.className = "error-message";
			setProcessingState(false);
		} else if (response && response.geminiResult) {
			try {
				const aiResultObject = JSON.parse(response.geminiResult);
				geminiOutputDiv.textContent = JSON.stringify(aiResultObject, null, 2); // Keep pre for JSON
				geminiOutputDiv.className = ""; // Default class for pre
				if (aiResultObject && aiResultObject.formId && Array.isArray(aiResultObject.fieldsToFill)) {
					if (aiResultObject.fieldsToFill.length > 0) {
						currentPendingAIDataForFill = { tabId, data: aiResultObject };
						setProcessingState(true, "AI response received. Previewing fields...");
						chrome.tabs.sendMessage(tabId, { action: "previewFieldsToFill", data: aiResultObject }, (previewResponse) => {
							setProcessingState(false);
							if (chrome.runtime.lastError || !previewResponse || previewResponse.status !== "success") {
								showGeneralPopupMessage(
									`Error previewing fields: ${chrome.runtime.lastError?.message || previewResponse?.message || "Unknown"}`,
									"error"
								);
								currentPendingAIDataForFill = null;
							} else {
								fillConfirmationMessage.textContent = `AI suggests filling ${previewResponse.fieldsPreviewed} field(s) on form '${aiResultObject.formId}'. Check highlights on the page.`;
								fillConfirmationSection.style.display = "flex";
								// geminiOutputDiv.textContent += "\n\n(Awaiting your confirmation to fill fields)";
							}
						});
					} else {
						// geminiOutputDiv.textContent += "\n\n(AI suggested no fields to fill)";
						showGeneralPopupMessage(`AI analyzed form '${aiResultObject.formId}' but suggested no fields to fill.`, "info");
						setProcessingState(false);
					}
				} else {
					// geminiOutputDiv.textContent += "\n\n(AI response structure not as expected for filling)";
					showGeneralPopupMessage("AI response structure not as expected for filling.", "warning");
					setProcessingState(false);
				}
			} catch (e) {
				geminiOutputDiv.textContent = "AI returned invalid JSON:\n" + response.geminiResult;
				geminiOutputDiv.className = "error-message";
				console.error("POPUP Parse Gemini JSON Error:", e);
				setProcessingState(false);
			}
		} else {
			geminiOutputDiv.textContent = "No valid AI output received.";
			geminiOutputDiv.className = "";
			showGeneralPopupMessage("No valid AI output received from service.", "warning");
			setProcessingState(false);
		}
	}

	function executeConfirmedFill() {
		if (!currentPendingAIDataForFill) return;
		const { tabId, data } = currentPendingAIDataForFill;
		fillConfirmationSection.style.display = "none";
		setProcessingState(true, "Filling form on page...");

		chrome.tabs.sendMessage(tabId, { action: "fillForm", data: data }, (fillResponse) => {
			setProcessingState(false);
			if (chrome.runtime.lastError) {
				showGeneralPopupMessage(`Error during fill: ${chrome.runtime.lastError.message}`, "error");
			} else if (fillResponse) {
				if (fillResponse.status === "success") {
					showGeneralPopupMessage(`Successfully filled ${fillResponse.fieldsFilled} field(s) on form ${data.formId}.`, "success");
					lastFillSuccessful = true;
					if (fillResponse.undoAvailable) {
						undoFillButton.disabled = false;
						undoFillButton.style.display = "flex";
					} else {
						undoFillButton.disabled = true;
						undoFillButton.style.display = "none";
					}
				} else {
					showGeneralPopupMessage(`Form fill for ${data.formId} reported: ${fillResponse.message}`, "warning");
				}
			} else {
				showGeneralPopupMessage(`No response from page after fill command for ${data.formId}.`, "error");
			}
			currentPendingAIDataForFill = null;
		});
	}

	function cancelAIFillPreview() {
		fillConfirmationSection.style.display = "none";
		if (currentPendingAIDataForFill) {
			const { tabId } = currentPendingAIDataForFill;
			chrome.tabs.sendMessage(tabId, { action: "clearFieldPreviews" }, () => {
				if (chrome.runtime.lastError) console.warn("Error clearing previews:", chrome.runtime.lastError.message);
			});
			// geminiOutputDiv.textContent += "\n\n(Fill operation cancelled by user.)";
			currentPendingAIDataForFill = null;
		}
		showGeneralPopupMessage("Fill preview cancelled.", "info", 3000);
	}

	function handleUndoFill() {
		if (!lastFillSuccessful && undoFillButton.disabled) return;
		getActiveTabId((tabId) => {
			if (!tabId) {
				showGeneralPopupMessage("Cannot undo: No active tab found.", "error");
				return;
			}
			setProcessingState(true, "Undoing last fill...");
			chrome.tabs.sendMessage(tabId, { action: "undoLastFill" }, (undoResponse) => {
				setProcessingState(false);
				if (chrome.runtime.lastError) {
					showGeneralPopupMessage(`Error during undo: ${chrome.runtime.lastError.message}`, "error");
				} else if (undoResponse) {
					if (undoResponse.status === "success") {
						showGeneralPopupMessage(`Successfully undid ${undoResponse.fieldsUndone} field change(s).`, "success");
						lastFillSuccessful = false;
						undoFillButton.disabled = true;
						undoFillButton.style.display = "none";
					} else {
						showGeneralPopupMessage(`Undo operation reported: ${undoResponse.message}`, "warning");
					}
				} else {
					showGeneralPopupMessage("No response from page after undo command.", "error");
				}
			});
		});
	}

	function displayFormsFound(formsDataArray) {
		formsFoundDiv.innerHTML = ""; // Clear previous
		if (!formsDataArray || formsDataArray.length === 0) {
			formsFoundDiv.innerHTML = '<p class="no-forms">No forms found on this page.</p>';
			return;
		}
		formsDataArray.forEach((form, formIndex) => {
			const formSection = document.createElement("div");
			formSection.className = "form-section";
			let titleText = `Form ${formIndex + 1} (ID: ${form.uniqueId})`;
			if (form.uniqueId === manuallySelectedFormId) {
				titleText += ` <strong style="font-weight:bold;">(USER SELECTED)</strong>`; // Simpler highlight
				formSection.classList.add("user-selected-form-details");
			}
			const h2 = document.createElement("h2");
			h2.innerHTML = titleText; // Use innerHTML for the strong tag
			formSection.appendChild(h2);

			if (form.fields.length > 0) {
				const ul = document.createElement("ul");
				form.fields.forEach((field) => {
					const li = document.createElement("li");
					li.textContent = `Name: "${field.name || "N/A"}", Type: "${field.type || "N/A"}"`;
					ul.appendChild(li);
				});
				formSection.appendChild(ul);
			} else {
				const p = document.createElement("p");
				p.textContent = "No fields detected in this form.";
				formSection.appendChild(p);
			}
			formsFoundDiv.appendChild(formSection);
		});
	}

	function handleErrorInUI(formsMsg, geminiMsg) {
		console.error("POPUP: handleErrorInUI. Forms Msg:", formsMsg, "Gemini Msg:", geminiMsg);
		if (formsFoundDiv) {
			formsFoundDiv.innerHTML = `<p class="error-message">${formsMsg}</p>`;
			if (formsFoundDiv.style.display === "none" && toggleFormsFoundButton) toggleFormsFoundButton.click(); // Open if error
		}
		if (geminiOutputDiv) {
			geminiOutputDiv.textContent = geminiMsg;
			geminiOutputDiv.className = "error-message";
			if (geminiOutputContainer.style.display === "none" && toggleGeminiOutputButton) toggleGeminiOutputButton.click(); // Open if error
		}
		setProcessingState(false);
	}
});
