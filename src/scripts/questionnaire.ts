import type { SupabaseClient } from '@supabase/supabase-js';

export type QuestionnairePersonField = { id: string; label: string; type: 'text' | 'single'; options?: string[] };
export type QuestionnaireCondition = { fieldId: string; values: string[] };
export type QuestionnaireField = { id: string; label: string; type: 'single' | 'multi' | 'text' | 'textarea' | 'number' | 'people'; required?: boolean; options?: string[]; conditions?: QuestionnaireCondition[]; conditionMode?: 'any' | 'all'; countLabel?: string; personFields?: QuestionnairePersonField[] };
export type QuestionnaireDefinition = { id: string; version: number; schema: QuestionnaireField[] };
type QuestionnaireStats = { fields: { id: string; label: string; type: string; choices?: { label: string; count: number | null; suppressed?: boolean }[]; count?: number | null; submissions: number | null; suppressed?: boolean; version: number }[] };
type AdminResponse = { article_id: string; title: string; slug: string; status: string; version: number; schema: QuestionnaireField[]; answers: Record<string, unknown>; submitted_at: string };
const h = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char).replace(/`/g, '&#96;');
const bn = new Intl.NumberFormat('bn-BD', { maximumFractionDigits: 0 });
const selector = (value: string) => CSS.escape(value);

function selected(root: HTMLElement, id: string) { return root.querySelector<HTMLInputElement>(`[data-q-answer="${selector(id)}"]:checked`)?.value ?? ''; }
function visible(field: QuestionnaireField, schema: QuestionnaireField[], root: HTMLElement) {
  const conditions = field.conditions ?? [];
  if (!conditions.length) return true;
  const matches = conditions.map((condition) => {
    const parent = schema.find((item) => item.id === condition.fieldId);
    if (!parent) return false;
    const values = parent.type === 'multi' ? Array.from(root.querySelectorAll<HTMLInputElement>(`[data-q-answer="${selector(parent.id)}"]:checked`)).map((input) => input.value) : [selected(root, parent.id)];
    return values.some((value) => condition.values.includes(value));
  });
  return field.conditionMode === 'all' ? matches.every(Boolean) : matches.some(Boolean);
}

export function renderQuestionnaire(root: HTMLElement, schema: QuestionnaireField[]) {
  root.innerHTML = schema.map((field) => {
    const required = Boolean(field.required);
    let control = '';
    if (field.type === 'single' || field.type === 'multi') {
      const type = field.type === 'single' ? 'radio' : 'checkbox';
      control = `<div class="questionnaire-options" role="group" aria-label="${h(field.label)}">${(field.options ?? []).map((option, index) => `<label class="questionnaire-option"><input type="${type}" name="q_${h(field.id)}" value="${h(option)}" data-q-answer="${h(field.id)}" ${required && type === 'radio' && index === 0 ? 'required' : ''}><span>${h(option)}</span></label>`).join('')}</div>`;
    } else if (field.type === 'text') control = `<input type="text" maxlength="500" data-q-answer="${h(field.id)}" ${required ? 'required' : ''}>`;
    else if (field.type === 'textarea') control = `<textarea rows="3" maxlength="3000" data-q-answer="${h(field.id)}" ${required ? 'required' : ''}></textarea>`;
    else if (field.type === 'number') control = `<input type="number" min="0" max="10000000" step="1" data-q-answer="${h(field.id)}" ${required ? 'required' : ''}>`;
    else if (field.type === 'people') control = `<label class="field-label questionnaire-count">${h(field.countLabel ?? 'ব্যক্তির সংখ্যা')}<input type="number" min="0" max="100" value="0" data-q-count="${h(field.id)}"></label><div class="questionnaire-people" data-q-people="${h(field.id)}"></div>`;
    return `<section class="questionnaire-field" data-q-field="${h(field.id)}"><div class="questionnaire-field__heading"><strong>${h(field.label)}</strong><span class="questionnaire-${required ? 'required' : 'optional'}">${required ? 'আবশ্যক' : 'ঐচ্ছিক'}</span></div>${control}</section>`;
  }).join('');
  const refresh = () => schema.forEach((field) => {
    const section = root.querySelector<HTMLElement>(`[data-q-field="${selector(field.id)}"]`);
    if (!section) return;
    const isVisible = visible(field, schema, root);
    section.hidden = !isVisible;
    section.querySelectorAll<HTMLElement>('[data-q-answer]').forEach((control) => {
      const input = control as HTMLInputElement | HTMLTextAreaElement;
      input.disabled = !isVisible;
      if (!isVisible) { if (input.type === 'radio' || input.type === 'checkbox') (input as HTMLInputElement).checked = false; else input.value = ''; }
    });
    if (!isVisible) section.querySelectorAll<HTMLInputElement>('[data-q-count]').forEach((input) => { input.value = '0'; section.querySelector<HTMLElement>('[data-q-people]')?.replaceChildren(); });
  });
  root.querySelectorAll<HTMLInputElement>('[data-q-count]').forEach((counter) => counter.addEventListener('input', () => {
    const field = schema.find((entry) => entry.id === counter.dataset.qCount);
    const holder = root.querySelector<HTMLElement>(`[data-q-people="${selector(counter.dataset.qCount ?? '')}"]`);
    if (!field || !holder) return;
    const count = Math.max(0, Math.min(100, Math.trunc(Number(counter.value) || 0)));
    counter.value = String(count);
    const existing = new Map<number, Map<string, string>>();
    holder.querySelectorAll<HTMLInputElement>('[data-q-person-index]').forEach((input) => {
      const index = Number(input.dataset.qPersonIndex);
      if (!existing.has(index)) existing.set(index, new Map());
      if (input.type !== 'radio' || input.checked) existing.get(index)!.set(input.dataset.qPersonKey ?? '', input.value);
    });
    holder.innerHTML = Array.from({ length: count }, (_, index) => `<fieldset class="questionnaire-person"><legend>${h(field.countLabel ?? 'ব্যক্তি')} ${bn.format(index + 1)}</legend>${(field.personFields ?? []).map((subfield) => subfield.type === 'single'
      ? `<fieldset class="questionnaire-person-choice"><legend>${h(subfield.label)}</legend><div class="questionnaire-options">${(subfield.options ?? []).map((option) => `<label class="questionnaire-option"><input type="radio" name="q_person_${h(field.id)}_${index}_${h(subfield.id)}" value="${h(option)}" data-q-person-index="${index}" data-q-person-key="${h(subfield.id)}"><span>${h(option)}</span></label>`).join('')}</div></fieldset>`
      : `<label class="field-label">${h(subfield.label)}<input type="text" maxlength="500" data-q-person-index="${index}" data-q-person-key="${h(subfield.id)}"></label>`).join('')}</fieldset>`).join('');
    holder.querySelectorAll<HTMLInputElement>('[data-q-person-index]').forEach((input) => {
      const value = existing.get(Number(input.dataset.qPersonIndex))?.get(input.dataset.qPersonKey ?? '');
      if (input.type === 'radio') input.checked = input.value === value;
      else input.value = value ?? '';
    });
  }));
  root.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement;
    if (target.matches('[data-q-person-index]') && target.type === 'radio') {
      const section = target.closest<HTMLElement>('[data-q-field]');
      const field = schema.find((entry) => entry.id === section?.dataset.qField);
      const person = field?.personFields?.find((entry) => entry.id === target.dataset.qPersonKey);
      const checked = root.querySelectorAll<HTMLInputElement>(`[data-q-person-index="${target.dataset.qPersonIndex}"][data-q-person-key="${target.dataset.qPersonKey}"]:checked`);
      const valid = Boolean(person?.options?.includes(target.value));
      if (checked.length && !valid) target.checked = false;
    }
    refresh();
  });
  root.addEventListener('input', (event) => { if ((event.target as HTMLElement).matches('[data-q-answer]')) refresh(); });
  refresh();
}

export function collectQuestionnaireAnswers(root: HTMLElement, schema: QuestionnaireField[], onError: (message: string) => void) {
  const answers: Record<string, unknown> = {};
  for (const field of schema) {
    const section = root.querySelector<HTMLElement>(`[data-q-field="${selector(field.id)}"]`);
    if (!section || section.hidden) continue;
    let answer: unknown = null;
    if (field.type === 'single') answer = section.querySelector<HTMLInputElement>('[data-q-answer]:checked')?.value ?? null;
    else if (field.type === 'multi') answer = Array.from(section.querySelectorAll<HTMLInputElement>('[data-q-answer]:checked')).map((input) => input.value);
    else if (field.type === 'people') {
      const count = Number(section.querySelector<HTMLInputElement>('[data-q-count]')?.value ?? 0);
      const people = Array.from({ length: count }, (_, index) => Object.fromEntries(Array.from(section.querySelectorAll<HTMLElement>(`[data-q-person-index="${index}"]`)).map((element) => element as HTMLInputElement | HTMLSelectElement).filter((input) => (input.type !== 'radio' || (input as HTMLInputElement).checked) && input.value.trim()).map((input) => [input.dataset.qPersonKey ?? '', input.value.trim()])));
      answer = { count, people };
    } else {
      const input = section.querySelector<HTMLInputElement | HTMLTextAreaElement>('[data-q-answer]');
      answer = input?.value.trim() ? field.type === 'number' ? Number(input.value) : input.value.trim() : null;
    }
    if (field.required && (answer === null || answer === '' || (Array.isArray(answer) && !answer.length))) {
      onError(`“${field.label}” প্রশ্নের উত্তর দিন।`); section.scrollIntoView({ behavior: 'smooth', block: 'center' }); return null;
    }
    if (field.type === 'people' && field.required) {
      const peopleAnswer = answer as { count: number; people: Record<string, string>[] };
      if (peopleAnswer.count > 0 && peopleAnswer.people.some((person) => !Object.values(person).some((value) => value.trim()))) {
        onError(`“${field.label}” প্রশ্নে প্রত্যেক ব্যক্তির অন্তত একটি পরিচিতি লিখুন।`); section.scrollIntoView({ behavior: 'smooth', block: 'center' }); return null;
      }
    }
    if (answer !== null && (!Array.isArray(answer) || answer.length)) answers[field.id] = answer;
  }
  return answers;
}

export function readQuestionnaireEditor(root: HTMLElement, fallback: QuestionnaireField[]): QuestionnaireField[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-q-editor-card]')).map((card, index) => {
    const id = card.dataset.qEditorId ?? '';
    const original = fallback.find((field) => field.id === id);
    const field: QuestionnaireField = structuredClone(original ?? { id: `question_${Date.now()}_${index}`, label: 'নতুন প্রশ্ন', type: 'text' });
    field.label = card.querySelector<HTMLInputElement>('[data-q-label]')?.value.trim() || 'নতুন প্রশ্ন';
    field.type = (card.querySelector<HTMLInputElement>('[data-q-type]')?.value || field.type) as QuestionnaireField['type'];
    field.required = Boolean(card.querySelector<HTMLInputElement>('[data-q-required]')?.checked);
    if (field.type === 'single' || field.type === 'multi') field.options = (card.querySelector<HTMLTextAreaElement>('[data-q-options]')?.value ?? (field.options ?? []).join('\n')).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    else delete field.options;
    if (field.type === 'people') {
      field.countLabel = card.querySelector<HTMLInputElement>('[data-q-count-label]')?.value.trim() || 'ব্যক্তির সংখ্যা';
      field.personFields = Array.from(card.querySelectorAll<HTMLElement>('[data-q-person-editor]')).map((row, personIndex) => {
        const old = original?.personFields?.[Number(row.dataset.qPersonEditor)];
        const type = row.querySelector<HTMLInputElement>('[data-q-person-type]')?.value === 'single' ? 'single' : 'text';
        return { id: old?.id ?? `identity_${personIndex + 1}`, label: row.querySelector<HTMLInputElement>('[data-q-person-label]')?.value.trim() || 'পরিচিতি', type, ...(type === 'single' ? { options: (row.querySelector<HTMLInputElement>('[data-q-person-options]')?.value ?? '').split(/[،,]/).map((value) => value.trim()).filter(Boolean) } : {}) };
      });
    } else delete field.personFields;
    if (card.querySelector<HTMLInputElement>('[data-q-has-condition]')?.checked) {
      field.conditionMode = card.querySelector<HTMLInputElement>('[data-q-condition-mode]')?.value === 'all' ? 'all' : 'any';
      field.conditions = Array.from(card.querySelectorAll<HTMLElement>('[data-q-condition-row]')).map((row) => ({ fieldId: row.querySelector<HTMLInputElement>('[data-q-condition-parent]')?.value ?? '', values: (row.querySelector<HTMLInputElement>('[data-q-condition-values]')?.value ?? '').split(/[،,]/).map((value) => value.trim()).filter(Boolean) }));
    } else { delete field.conditions; delete field.conditionMode; }
    return field;
  });
}

export function renderQuestionnaireEditor(root: HTMLElement, schema: QuestionnaireField[], toast: (message: string, error?: boolean) => void) {
  const typeLabels: Record<QuestionnaireField['type'], string> = { single: 'একটি বিকল্প', multi: 'একাধিক বিকল্প', text: 'ছোট লেখা', textarea: 'বিস্তারিত লেখা', number: 'সংখ্যা', people: 'ব্যক্তির তালিকা' };
  root.innerHTML = schema.map((field, index) => `<article class="questionnaire-editor-card" data-q-editor-card data-q-editor-id="${h(field.id)}"><div class="questionnaire-editor-card__top"><strong>প্রশ্ন ${bn.format(index + 1)}</strong><div><button type="button" class="outline-button" data-q-up ${index === 0 ? 'disabled' : ''}>↑</button> <button type="button" class="outline-button" data-q-down ${index === schema.length - 1 ? 'disabled' : ''}>↓</button> <button type="button" class="outline-button" data-q-delete>প্রশ্ন মুছুন</button></div></div><label class="field-label">প্রশ্নের লেখা<input data-q-label value="${h(field.label)}" maxlength="160"></label><div class="editor-two-col"><label class="field-label">উত্তরের ধরন<select data-q-type>${Object.entries(typeLabels).map(([value, label]) => `<option value="${value}" ${field.type === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="field-check"><input type="checkbox" data-q-required ${field.required ? 'checked' : ''}><span>উত্তর আবশ্যক</span></label></div>${field.type === 'single' || field.type === 'multi' ? `<label class="field-label">বিকল্পসমূহ <small>প্রতি লাইনে একটি বিকল্প</small><textarea rows="4" data-q-options>${h((field.options ?? []).join('\n'))}</textarea></label>` : ''}${field.type === 'people' ? `<label class="field-label">গণনার শিরোনাম<input data-q-count-label value="${h(field.countLabel ?? 'ব্যক্তির সংখ্যা')}"></label><div class="questionnaire-person-editor">${(field.personFields ?? []).map((person, personIndex) => `<div class="questionnaire-person-editor__row" data-q-person-editor="${personIndex}"><label class="field-label">পরিচিতির ঘরের নাম<input data-q-person-label value="${h(person.label)}"></label><label class="field-label">ধরন<select data-q-person-type><option value="text" ${person.type === 'text' ? 'selected' : ''}>লেখা</option><option value="single" ${person.type === 'single' ? 'selected' : ''}>একটি বিকল্প</option></select></label><label class="field-label">বিকল্পসমূহ<input data-q-person-options value="${h((person.options ?? []).join('، '))}"></label><button type="button" class="outline-button" data-q-person-delete>ঘর মুছুন</button></div>`).join('')}</div><button type="button" class="outline-button" data-q-person-add>＋ পরিচিতির ঘর যোগ</button>` : ''}<fieldset class="questionnaire-condition-editor"><legend>কখন দেখাবেন</legend><label class="field-check"><input type="checkbox" data-q-has-condition ${(field.conditions?.length ?? 0) ? 'checked' : ''}><span>অন্য উত্তরের ওপর নির্ভরশীল</span></label><div data-q-condition-controls ${(field.conditions?.length ?? 0) ? '' : 'hidden'}><label class="field-label">শর্তের ধরন<select data-q-condition-mode><option value="any" ${field.conditionMode !== 'all' ? 'selected' : ''}>যেকোনো একটি মিললে</option><option value="all" ${field.conditionMode === 'all' ? 'selected' : ''}>সবগুলো মিললে</option></select></label><div data-q-condition-list>${(field.conditions ?? []).map((condition, conditionIndex) => `<div class="questionnaire-condition-row" data-q-condition-row="${conditionIndex}"><label class="field-label">নির্ভরশীল প্রশ্ন<select data-q-condition-parent>${schema.filter((candidate) => candidate.id !== field.id).map((candidate) => `<option value="${h(candidate.id)}" ${candidate.id === condition.fieldId ? 'selected' : ''}>${h(candidate.label)}</option>`).join('')}</select></label><label class="field-label">যে উত্তরগুলোর সঙ্গে মিলবে<input data-q-condition-values value="${h(condition.values.join('، '))}"></label><button type="button" class="outline-button" data-q-condition-delete>শর্ত মুছুন</button></div>`).join('')}</div><button type="button" class="outline-button" data-q-condition-add>＋ শর্ত যোগ</button></div></fieldset></article>`).join('');
  const read = () => readQuestionnaireEditor(root, schema);
  root.querySelectorAll<HTMLInputElement>('[data-q-type]').forEach((select) => select.addEventListener('change', () => {
    const next = read();
    const field = next.find((entry) => entry.id === select.closest<HTMLElement>('[data-q-editor-card]')?.dataset.qEditorId);
    if (field) field.type = select.value as QuestionnaireField['type'];
    renderQuestionnaireEditor(root, next, toast);
  }));
  root.querySelectorAll<HTMLInputElement>('[data-q-has-condition]').forEach((input) => input.addEventListener('change', () => { const controls = input.closest('fieldset')?.querySelector<HTMLElement>('[data-q-condition-controls]'); if (controls) controls.hidden = !input.checked; }));
  root.querySelectorAll<HTMLButtonElement>('[data-q-delete]').forEach((button) => button.addEventListener('click', () => { const next = read(); const index = next.findIndex((entry) => entry.id === button.closest<HTMLElement>('[data-q-editor-card]')?.dataset.qEditorId); if (index >= 0) { const [removed] = next.splice(index, 1); for (const field of next) field.conditions = field.conditions?.filter((condition) => condition.fieldId !== removed.id); } if (next.length) renderQuestionnaireEditor(root, next, toast); else toast('প্রশ্নমালায় অন্তত একটি প্রশ্ন রাখতে হবে।', true); }));
  root.querySelectorAll<HTMLButtonElement>('[data-q-up], [data-q-down]').forEach((button) => button.addEventListener('click', () => { const next = read(); const card = button.closest<HTMLElement>('[data-q-editor-card]'); const index = next.findIndex((entry) => entry.id === card?.dataset.qEditorId); const target = index + (button.hasAttribute('data-q-up') ? -1 : 1); if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; renderQuestionnaireEditor(root, next, toast); }));
  root.querySelectorAll<HTMLButtonElement>('[data-q-person-add]').forEach((button) => button.addEventListener('click', () => { const next = read(); const field = next.find((entry) => entry.id === button.closest<HTMLElement>('[data-q-editor-card]')?.dataset.qEditorId); if (!field) return; field.personFields ??= []; let n = 1; while (field.personFields.some((person) => person.id === `identity_${n}`)) n++; field.personFields.push({ id: `identity_${n}`, label: 'নতুন পরিচিতি', type: 'text' }); renderQuestionnaireEditor(root, next, toast); }));
  root.querySelectorAll<HTMLButtonElement>('[data-q-person-delete]').forEach((button) => button.addEventListener('click', () => { const next = read(); const field = next.find((entry) => entry.id === button.closest<HTMLElement>('[data-q-editor-card]')?.dataset.qEditorId); const row = button.closest<HTMLElement>('[data-q-person-editor]'); field?.personFields?.splice(Number(row?.dataset.qPersonEditor), 1); renderQuestionnaireEditor(root, next, toast); }));
  root.querySelectorAll<HTMLButtonElement>('[data-q-condition-add]').forEach((button) => button.addEventListener('click', () => { const next = read(); const field = next.find((entry) => entry.id === button.closest<HTMLElement>('[data-q-editor-card]')?.dataset.qEditorId); if (!field) return; const index = next.indexOf(field); const parent = next.slice(0, index).reverse().find((candidate) => (candidate.type === 'single' || candidate.type === 'multi') && (candidate.options?.length ?? 0) > 0); if (!parent) return toast('শর্ত যোগ করতে আগে একটি বিকল্পভিত্তিক প্রশ্ন রাখতে হবে।', true); field.conditions ??= []; const option = (parent.options ?? [])[0]; if (!option) return toast('শর্তের প্রশ্নে আগে বিকল্প যোগ করুন।', true); field.conditions.push({ fieldId: parent.id, values: [option] }); field.conditionMode ??= 'any'; renderQuestionnaireEditor(root, next, toast); }));
  root.querySelectorAll<HTMLButtonElement>('[data-q-condition-delete]').forEach((button) => button.addEventListener('click', () => { const next = read(); const field = next.find((entry) => entry.id === button.closest<HTMLElement>('[data-q-editor-card]')?.dataset.qEditorId); const row = button.closest<HTMLElement>('[data-q-condition-row]'); field?.conditions?.splice(Number(row?.dataset.qConditionRow), 1); renderQuestionnaireEditor(root, next, toast); }));
}

export function initQuestionnaireAdmin(supabase: SupabaseClient | null, isAdmin: () => boolean, toast: (message: string, error?: boolean) => void, setMessage: (target: HTMLElement | null, message: string, error?: boolean) => void) {
  const builder = document.querySelector<HTMLElement>('[data-questionnaire-editor]');
  const addButton = document.querySelector<HTMLButtonElement>('[data-questionnaire-add]');
  const saveButton = document.querySelector<HTMLButtonElement>('[data-questionnaire-save]');
  const error = document.querySelector<HTMLElement>('[data-questionnaire-error]');
  const responses = document.querySelector<HTMLElement>('[data-questionnaire-responses]');
  if (!builder || !addButton || !saveButton) return;
  let current: QuestionnaireField[] = [];
  let loadedVersion: QuestionnaireDefinition | null = null;
  const load = async () => {
    if (!supabase || builder.dataset.loading === 'true') return;
    if (!isAdmin()) {
      builder.replaceChildren();
      responses?.replaceChildren();
      builder.dataset.loaded = 'false';
      loadedVersion = null;
      current = [];
      return;
    }
    if (builder.dataset.loaded === 'true') return;
    builder.dataset.loading = 'true';
    const result = await supabase.rpc('get_active_article_questionnaire');
    const data = result.data as QuestionnaireDefinition | QuestionnaireDefinition[] | null;
    const definition = Array.isArray(data) ? data[0] : data;
    if (result.error || !definition) { setMessage(error, result.error?.message ?? 'প্রশ্নমালা পাওয়া যায়নি।'); builder.dataset.loading = 'false'; return; }
    builder.dataset.loading = 'false';
    if (!isAdmin()) { builder.replaceChildren(); responses?.replaceChildren(); return; }
    builder.dataset.loaded = 'true';
    loadedVersion = definition;
    current = structuredClone(definition.schema);
    renderQuestionnaireEditor(builder, current, toast);
    await loadQuestionnaireResponses(supabase, responses, isAdmin);
  };
  if (builder.dataset.bound === 'true') { void load(); return; }
  builder.dataset.bound = 'true';
  addButton.addEventListener('click', () => {
    current = readQuestionnaireEditor(builder, current);
    current.push({ id: `question_${Date.now()}_${current.length}`, label: 'নতুন প্রশ্ন', type: 'text' });
    renderQuestionnaireEditor(builder, current, toast);
  });
  builder.addEventListener('input', () => { current = readQuestionnaireEditor(builder, current); });
  saveButton.addEventListener('click', async () => {
    if (!supabase || !isAdmin()) return;
    current = readQuestionnaireEditor(builder, current);
    if (loadedVersion) current = current.map((field) => {
      field.conditions = (field.conditions ?? []).map((condition) => {
        const parent = current.find((candidate) => candidate.id === condition.fieldId);
        const originalParent = loadedVersion!.schema.find((candidate) => candidate.id === condition.fieldId);
        const values = condition.values.filter((value) => !(originalParent?.options ?? []).includes(value) || (parent?.options ?? []).includes(value));
        return { ...condition, values };
      }).filter((condition) => condition.values.length > 0);
      return field;
    });
    const positions = new Map(current.map((field, index) => [field.id, index]));
    if (current.some((field, index) => field.conditions?.some((condition) => (positions.get(condition.fieldId) ?? index) >= index))) return toast('শর্তের প্রশ্ন আগে রাখতে প্রশ্নগুলোর ক্রম ঠিক করুন।', true);
    saveButton.disabled = true;
    const result = await supabase.rpc('save_article_questionnaire', { p_schema: current });
    saveButton.disabled = false;
    if (result.error) return setMessage(error, result.error.message);
    setMessage(error, '', false);
    toast(`প্রশ্নমালার ${bn.format(Number(result.data))}তম সংস্করণ সংরক্ষিত হয়েছে।`);
    builder.dataset.loaded = 'false';
    await load();
  });
  void load();
}

async function loadQuestionnaireResponses(supabase: SupabaseClient, target: HTMLElement | null, isAdmin: () => boolean) {
  if (!target || !isAdmin()) return;
  const result = await supabase.rpc('get_article_questionnaire_responses', { p_limit: 100 });
  if (!isAdmin()) { target.replaceChildren(); return; }
  if (result.error) { target.innerHTML = `<p class="form-error">${h(result.error.message)}</p>`; return; }
  const entries = (result.data ?? []) as AdminResponse[];
  target.innerHTML = `<h3>প্রতিবেদনের ব্যক্তিগত উত্তর · শুধু প্রশাসকের জন্য</h3>${entries.map((entry) => {
    const fields = new Map(entry.schema.map((field) => [field.id, field.label]));
    const displayValue = (field: QuestionnaireField | undefined, value: unknown): string => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const object = value as Record<string, unknown>;
        if (typeof object.count === 'number' && Array.isArray(object.people)) {
          const personLabels = new Map((field?.personFields ?? []).map((person) => [person.id, person.label]));
          const people = object.people.map((person, index) => `<li><strong>ব্যক্তি ${bn.format(index + 1)}</strong><ul>${Object.entries(person as Record<string, unknown>).map(([key, entry]) => `<li><strong>${h(personLabels.get(key) ?? key)}:</strong> ${h(entry)}</li>`).join('')}</ul></li>`).join('');
          return `<strong>মোট ${bn.format(object.count)} জন</strong><ul>${people}</ul>`;
        }
      }
      const values = Array.isArray(value) ? value.map((entry) => h(entry)).join('، ') : h(value);
      return values || 'উত্তর দেওয়া হয়নি';
    };
    const answers = Object.entries(entry.answers).map(([id, value]) => `<li><strong>${h(fields.get(id) ?? id)}:</strong> ${displayValue(entry.schema.find((field) => field.id === id), value)}</li>`).join('');
    return `<details class="history-entry"><summary><strong>${h(entry.title)}</strong> · ${entry.status === 'published' ? 'প্রকাশিত' : 'অপেক্ষমাণ'} · সংস্করণ ${bn.format(entry.version)} · ${h(new Date(entry.submitted_at).toLocaleDateString('bn-BD'))}</summary><ul>${answers}</ul><a class="text-link" href="/news/${encodeURIComponent(entry.slug)}/">প্রতিবেদন দেখুন ↗</a></details>`;
  }).join('') || '<div class="feed-empty"><strong>এখনো প্রশ্নোত্তরসহ প্রতিবেদন জমা হয়নি।</strong></div>'}`;
}

export async function initPublicQuestionnaireStats(supabase: SupabaseClient | null) {
  const root = document.querySelector<HTMLElement>('[data-public-questionnaire-stats]');
  if (!root) return;
  if (!supabase) { root.innerHTML = '<div class="feed-empty"><strong>পরিসংখ্যান দেখতে তথ্যভান্ডারের সংযোগ প্রয়োজন।</strong></div>'; return; }
  const result = await supabase.rpc('get_public_article_questionnaire_stats');
  if (result.error) { root.innerHTML = `<p class="form-error">${h(result.error.message)}</p>`; return; }
  const data = result.data as QuestionnaireStats;
  root.innerHTML = (data?.fields ?? []).map((field) => {
    if (field.type === 'people' || field.type === 'number') return `<article class="statistics-card"><span class="section-kicker">${h(field.label)}</span><strong>${field.suppressed ? 'গোপনীয়' : bn.format(field.count ?? 0)}</strong><p>${field.suppressed ? 'গোপনীয়তার জন্য কম সংখ্যার তথ্য দেখানো হয়নি।' : `${bn.format(field.submissions ?? 0)}টি প্রকাশিত প্রতিবেদনের সমষ্টি`} · সংস্করণ ${bn.format(field.version)}</p></article>`;
    const choices = (field.choices ?? []).map((choice) => `<li><span>${h(choice.label)}</span><strong>${choice.suppressed ? 'গোপনীয়' : bn.format(choice.count ?? 0)}</strong></li>`).join('');
    return `<article class="statistics-card"><span class="section-kicker">${h(field.label)}</span><ul>${choices}</ul><p>${field.suppressed ? 'গোপনীয়তার জন্য কম সংখ্যার তথ্য দেখানো হয়নি।' : `${bn.format(field.submissions ?? 0)}টি প্রকাশিত প্রতিবেদন`} · সংস্করণ ${bn.format(field.version)}</p></article>`;
  }).join('') || '<div class="feed-empty"><strong>প্রকাশিত প্রতিবেদন থেকে পরিসংখ্যান এখনো তৈরি হয়নি।</strong></div>';
}
