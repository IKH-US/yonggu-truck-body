/* Content-only enhancements. No hero, renderer, timeline or loading changes. */
(() => {
  'use strict';
  const form = document.getElementById('enquiryForm');
  if (!form) return;
  const fields = ['name', 'phone', 'consent'].map(name => form.elements[name]);
  const touched = new Set();
  fields.forEach(field => {
    field.id ||= 'enquiry-' + field.name;
    const error = document.createElement('small');
    error.id = field.id + '-error'; error.className = 'field-error'; error.hidden = true;
    field.setAttribute('aria-describedby', error.id);
    field.closest('label').append(error);
  });
  function message(field) {
    if (field.name === 'consent') return field.checked ? '' : '請閱讀並同意私隱政策。';
    if (!field.value.trim()) return field.name === 'name' ? '請填寫你的稱呼。' : '請填寫聯絡電話。';
    if (field.name === 'phone') {
      const phone = field.value.replace(/[\s-]/g, '');
      if (!/^(?:\+852)?[2-9]\d{7}$/.test(phone) && !/^(?:\+86)?1[3-9]\d{9}$/.test(phone))
        return '請填寫香港 8 位或內地 11 位電話，可加 +852 或 +86。';
    }
    return '';
  }
  function validate(field) {
    const text = message(field), error = document.getElementById(field.id + '-error');
    error.textContent = text; error.hidden = !text;
    field.setAttribute('aria-invalid', String(!!text));
    return !text;
  }
  form.noValidate = true; // Keep native required validation when JavaScript is unavailable.
  fields.forEach(field => {
    field.addEventListener('blur', () => { touched.add(field); validate(field); });
    field.addEventListener('input', () => { if (touched.has(field)) validate(field); });
    field.addEventListener('change', () => { if (touched.has(field)) validate(field); });
  });
  form.addEventListener('submit', event => {
    const invalid = fields.filter(field => { touched.add(field); return !validate(field); });
    if (!invalid.length) return; // Existing copy, WhatsApp and email handlers remain intact.
    event.preventDefault(); event.stopImmediatePropagation();
    document.getElementById('formStatus').textContent = '請修正標示的欄位，再繼續。';
    invalid[0].focus();
  }, true);
  form.addEventListener('reset', () => {
    touched.clear();
    fields.forEach(field => { field.removeAttribute('aria-invalid'); document.getElementById(field.id + '-error').hidden = true; });
  });
  document.querySelectorAll('#configForm .check-row').forEach(row => {
    const checkbox = row.querySelector('input');
    const text = document.createElement('span'); text.className = 'selection-state'; text.setAttribute('aria-hidden', 'true');
    row.append(text);
    const update = () => { text.textContent = checkbox.checked ? '已選' : '未選'; };
    checkbox.addEventListener('change', update); update();
  });
  const bar = document.getElementById('mobileContact'), contact = document.getElementById('contact');
  let contactVisible = false;
  function updateBar() {
    const editing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
    const hide = contactVisible || editing || document.body.classList.contains('menu-open');
    bar.classList.toggle('content-suppressed', hide); bar.inert = hide;
  }
  new IntersectionObserver(entries => { contactVisible = entries[0].isIntersecting; updateBar(); }).observe(contact);
  new MutationObserver(updateBar).observe(document.body, {attributes:true, attributeFilter:['class']});
  document.addEventListener('focusin', updateBar);
  document.addEventListener('focusout', () => setTimeout(updateBar, 0));
})();
