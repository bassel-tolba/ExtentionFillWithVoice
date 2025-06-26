// Global state for content script
let isFormSelectionModeActive = false;
let originalBodyCursor = "";
const FORM_SELECTOR_PERMANENT_HIGHLIGHT_CLASS = "ai-form-filler-permanent-highlight";
const FORM_SELECTOR_POTENTIAL_HIGHLIGHT_CLASS = "ai-form-filler-potential-highlight";
const FORM_SELECTOR_ALL_FORMS_HIGHLIGHT_CLASS = "ai-form-filler-all-selectable-highlight";
const FIELD_PREVIEW_HIGHLIGHT_CLASS = "ai-form-filler-field-preview-highlight"; // NEW: For field previews
let lastPotentialForm = null;
let permanentlyHighlightedForm = null;
let previewedFieldElements = []; // NEW: Store elements being previewed
let lastFilledFieldsOriginalData = null; // NEW: For Undo functionality

// Inject CSS for highlighting
const highlightStyles = `
  body.ai-form-selecting {
    cursor: crosshair !important;
  }
  .${FORM_SELECTOR_ALL_FORMS_HIGHLIGHT_CLASS} {
    outline: 1px solid #007bff !important;
    box-shadow: 0 0 5px rgba(0, 123, 255, 0.3) !important;
    background-color: rgba(0, 123, 255, 0.05) !important;
    transition: outline 0.1s ease-in-out, background-color 0.1s ease-in-out, box-shadow 0.1s ease-in-out;
  }
  .${FORM_SELECTOR_POTENTIAL_HIGHLIGHT_CLASS} {
    outline: 2px dotted #ffc107 !important;
    background-color: rgba(255, 193, 7, 0.15) !important;
    box-shadow: 0 0 8px rgba(255, 193, 7, 0.6) !important;
  }
  .${FORM_SELECTOR_PERMANENT_HIGHLIGHT_CLASS} {
    outline: 3px dashed #28a745 !important;
    box-shadow: 0 0 15px rgba(40, 167, 69, 0.7) !important;
    background-color: rgba(40, 167, 69, 0.15) !important;
  }
  /* NEW: Style for fields being previewed for filling */
  .${FIELD_PREVIEW_HIGHLIGHT_CLASS} {
    outline: 2px solid #17a2b8 !important; /* Info color outline */
    box-shadow: 0 0 8px rgba(23, 162, 184, 0.5) !important;
    background-color: rgba(23, 162, 184, 0.1) !important;
    transition: outline 0.1s ease-in-out, background-color 0.1s ease-in-out, box-shadow 0.1s ease-in-out;
  }
`;
const styleSheet = document.createElement("style");
styleSheet.innerText = highlightStyles;
document.head.appendChild(styleSheet);

function findParentForm(element) {
	let current = element;
	while (current) {
		if (current.tagName === "FORM" && current.hasAttribute("data-ai-form-id")) {
			return current;
		}
		current = current.parentElement;
	}
	return null;
}

function handlePageClickForFormSelection(event) {
	if (!isFormSelectionModeActive) return;
	event.preventDefault();
	event.stopPropagation();
	const targetElement = event.target;
	const formElement = findParentForm(targetElement);
	if (permanentlyHighlightedForm) {
		permanentlyHighlightedForm.classList.remove(FORM_SELECTOR_PERMANENT_HIGHLIGHT_CLASS);
		permanentlyHighlightedForm = null;
	}
	if (lastPotentialForm) {
		lastPotentialForm.classList.remove(FORM_SELECTOR_POTENTIAL_HIGHLIGHT_CLASS);
		lastPotentialForm = null;
	}
	if (formElement) {
		const formId = formElement.getAttribute("data-ai-form-id");
		formElement.classList.add(FORM_SELECTOR_PERMANENT_HIGHLIGHT_CLASS);
		permanentlyHighlightedForm = formElement;
		chrome.runtime.sendMessage({ action: "formSelectedByContentScript", formId: formId });
	} else {
		chrome.runtime.sendMessage({ action: "formSelectedByContentScript", formId: null });
	}
	stopFormSelectionMode(false);
}

function handlePageMousemoveForFormSelection(event) {
	if (!isFormSelectionModeActive) return;
	const targetElement = event.target;
	const formElement = findParentForm(targetElement);
	if (lastPotentialForm && lastPotentialForm !== formElement) {
		lastPotentialForm.classList.remove(FORM_SELECTOR_POTENTIAL_HIGHLIGHT_CLASS);
	}
	if (formElement && formElement !== lastPotentialForm && formElement !== permanentlyHighlightedForm) {
		if (formElement.classList.contains(FORM_SELECTOR_ALL_FORMS_HIGHLIGHT_CLASS)) {
			formElement.classList.add(FORM_SELECTOR_POTENTIAL_HIGHLIGHT_CLASS);
			lastPotentialForm = formElement;
		}
	} else if (!formElement && lastPotentialForm) {
		lastPotentialForm.classList.remove(FORM_SELECTOR_POTENTIAL_HIGHLIGHT_CLASS);
		lastPotentialForm = null;
	}
}

function handleEscapeKey(event) {
	if (isFormSelectionModeActive && event.key === "Escape") {
		event.preventDefault();
		event.stopPropagation();
		stopFormSelectionMode(true);
	}
}

function startFormSelectionMode() {
	if (isFormSelectionModeActive) return;
	isFormSelectionModeActive = true;
	const formsOnPage = document.querySelectorAll("form");
	formsOnPage.forEach((form, index) => {
		if (!form.hasAttribute("data-ai-form-id")) {
			form.setAttribute("data-ai-form-id", `form-${index}`);
		}
		form.classList.add(FORM_SELECTOR_ALL_FORMS_HIGHLIGHT_CLASS);
	});
	originalBodyCursor = document.body.style.cursor;
	document.body.classList.add("ai-form-selecting");
	document.addEventListener("click", handlePageClickForFormSelection, { capture: true });
	document.addEventListener("mousemove", handlePageMousemoveForFormSelection, { capture: true });
	document.addEventListener("keydown", handleEscapeKey, { capture: true });
	console.log("CONTENT: Form selection mode STARTED.");
}

function stopFormSelectionMode(sendCancellationMessage = false) {
	if (!isFormSelectionModeActive) return;
	isFormSelectionModeActive = false;
	document.body.style.cursor = originalBodyCursor;
	document.body.classList.remove("ai-form-selecting");
	document.removeEventListener("click", handlePageClickForFormSelection, { capture: true });
	document.removeEventListener("mousemove", handlePageMousemoveForFormSelection, { capture: true });
	document.removeEventListener("keydown", handleEscapeKey, { capture: true });
	const allForms = document.querySelectorAll(`form.${FORM_SELECTOR_ALL_FORMS_HIGHLIGHT_CLASS}`);
	allForms.forEach((form) => form.classList.remove(FORM_SELECTOR_ALL_FORMS_HIGHLIGHT_CLASS));
	if (lastPotentialForm) {
		lastPotentialForm.classList.remove(FORM_SELECTOR_POTENTIAL_HIGHLIGHT_CLASS);
		lastPotentialForm = null;
	}
	if (sendCancellationMessage) {
		chrome.runtime.sendMessage({ action: "formSelectionCancelledByContentScript" });
	}
	console.log("CONTENT: Form selection mode STOPPED.");
}

// --- NEW: Function to clear field preview highlights ---
function clearFieldPreviewHighlights() {
	previewedFieldElements.forEach((el) => el.classList.remove(FIELD_PREVIEW_HIGHLIGHT_CLASS));
	previewedFieldElements = [];
	console.log("CONTENT: Cleared field preview highlights.");
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === "extractForms") {
		clearFieldPreviewHighlights(); // Clear previews if forms are re-extracted
		if (permanentlyHighlightedForm) {
			permanentlyHighlightedForm.classList.remove(FORM_SELECTOR_PERMANENT_HIGHLIGHT_CLASS);
			permanentlyHighlightedForm = null;
		}
		const allHighlightedForms = document.querySelectorAll(`.${FORM_SELECTOR_ALL_FORMS_HIGHLIGHT_CLASS}`);
		allHighlightedForms.forEach((f) => f.classList.remove(FORM_SELECTOR_ALL_FORMS_HIGHLIGHT_CLASS));

		const forms = document.querySelectorAll("form");
		const allFormsData = [];
		forms.forEach((form, index) => {
			const uniqueId = `form-${index}`;
			form.setAttribute("data-ai-form-id", uniqueId);
			const formData = { uniqueId, action: form.getAttribute("action"), method: form.getAttribute("method"), fields: [] };
			form.querySelectorAll("input, select, textarea").forEach((element) => {
				const field = {
					tagName: element.tagName.toUpperCase(),
					type: element.type,
					name: element.name,
					id: element.id,
					value: element.value,
					placeholder: element.placeholder,
				};
				if (element.type === "checkbox" || element.type === "radio") field.checked = element.checked;
				if (element.tagName.toUpperCase() === "SELECT") {
					field.options = Array.from(element.options).map((opt) => ({ text: opt.text, value: opt.value, selected: opt.selected }));
				}
				formData.fields.push(field);
			});
			allFormsData.push(formData);
		});
		sendResponse(allFormsData);
		return true;
	}

	// --- NEW: Handler for previewing fields ---
	if (request.action === "previewFieldsToFill") {
		clearFieldPreviewHighlights(); // Clear any previous previews
		const { formId, fieldsToFill } = request.data;
		const targetForm = document.querySelector(`[data-ai-form-id="${formId}"]`);
		let count = 0;
		if (targetForm && fieldsToFill) {
			fieldsToFill.forEach((field) => {
				const element = targetForm.querySelector(`[name="${field.fieldName}"]`) || targetForm.querySelector(`#${field.fieldName}`);
				if (element) {
					element.classList.add(FIELD_PREVIEW_HIGHLIGHT_CLASS);
					previewedFieldElements.push(element);
					count++;
				}
			});
			console.log(`CONTENT: Previewing ${count} fields on form ${formId}.`);
			sendResponse({ status: "success", fieldsPreviewed: count });
		} else {
			sendResponse({ status: "error", message: "Target form or fields data not found for preview." });
		}
		return true;
	}

	// --- NEW: Handler to clear previews (e.g., if user cancels) ---
	if (request.action === "clearFieldPreviews") {
		clearFieldPreviewHighlights();
		sendResponse({ status: "previews_cleared" });
		return true;
	}

	if (request.action === "fillForm") {
		clearFieldPreviewHighlights(); // Filling implies preview is done
		console.log("--- AI FORM FILLER: STARTING FILL PROCESS ---");
		console.log("Received data:", request.data);
		const { formId, fieldsToFill } = request.data;
		if (!formId || !Array.isArray(fieldsToFill)) {
			console.error("AI FORM FILLER: Invalid data for filling:", request.data);
			sendResponse({ status: "error", message: "Invalid data structure." });
			return true;
		}
		const targetForm = document.querySelector(`[data-ai-form-id="${formId}"]`);
		if (!targetForm) {
			console.error(`AI FORM FILLER: FAILURE - Could not find form with ID: ${formId}`);
			sendResponse({ status: "error", message: `Form with ID ${formId} not found.` });
			return true;
		}
		console.log("AI FORM FILLER: SUCCESS - Found target form:", targetForm);

		lastFilledFieldsOriginalData = []; // Reset for current fill operation (for Undo)
		let fieldsFilledCount = 0;
		fieldsToFill.forEach((field) => {
			const { fieldName, fieldValue } = field;
			let element = targetForm.querySelector(`[name="${fieldName}"]`) || targetForm.querySelector(`#${fieldName}`);
			if (element) {
				// Store original value for undo
				const originalData = {
					element: element,
					originalValue: element.value,
					originalChecked: element.type === "checkbox" || element.type === "radio" ? element.checked : undefined,
				};
				lastFilledFieldsOriginalData.push(originalData);

				switch (element.type) {
					case "checkbox":
						element.checked = !!fieldValue;
						break;
					case "radio":
						const radioToSelect = targetForm.querySelector(`input[type="radio"][name="${fieldName}"][value="${String(fieldValue)}"]`);
						if (radioToSelect) {
							// For radio group, store original state of the one being checked now, and also the one that was checked before (if any)
							const currentlyChecked = targetForm.querySelector(`input[type="radio"][name="${fieldName}"]:checked`);
							if (currentlyChecked && currentlyChecked !== radioToSelect) {
								lastFilledFieldsOriginalData.push({
									element: currentlyChecked,
									originalValue: currentlyChecked.value, // value for radios
									originalChecked: true,
								});
							}
							radioToSelect.checked = true;
							element = radioToSelect;
						} else console.warn(`   Radio value "${fieldValue}" not found for name "${fieldName}"`);
						break;
					default:
						element.value = fieldValue;
						break;
				}
				element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
				element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
				fieldsFilledCount++;
			} else {
				console.warn(`   FAILURE: Could not find element with name or id of "${fieldName}" inside form #${formId}.`);
			}
		});
		console.log(
			`--- AI FORM FILLER: FINISHED. Filled ${fieldsFilledCount} fields. Undo data stored for ${lastFilledFieldsOriginalData.length} changes.`
		);
		sendResponse({ status: "success", fieldsFilled: fieldsFilledCount, undoAvailable: lastFilledFieldsOriginalData.length > 0 });
		return true;
	}

	// --- NEW: Handler for Undo ---
	if (request.action === "undoLastFill") {
		if (lastFilledFieldsOriginalData && lastFilledFieldsOriginalData.length > 0) {
			let undoneCount = 0;
			lastFilledFieldsOriginalData.forEach((item) => {
				if (item.element) {
					// Check if element still exists
					if (item.originalChecked !== undefined) {
						// Checkbox or radio
						item.element.checked = item.originalChecked;
					} else {
						// Text input, textarea, select etc.
						item.element.value = item.originalValue;
					}
					item.element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
					item.element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
					undoneCount++;
				}
			});
			console.log(`CONTENT: Undid ${undoneCount} field changes.`);
			lastFilledFieldsOriginalData = null; // Clear undo data after use
			sendResponse({ status: "success", fieldsUndone: undoneCount });
		} else {
			console.log("CONTENT: No undo data available.");
			sendResponse({ status: "no_undo_data", message: "No actions to undo." });
		}
		return true;
	}

	if (request.action === "startFormSelectionMode") {
		startFormSelectionMode();
		sendResponse({ status: "listening" });
	} else if (request.action === "cancelFormSelectionMode") {
		stopFormSelectionMode(true);
		sendResponse({ status: "cancelled" });
	}
	return true; // Keep message channel open for async responses
});
