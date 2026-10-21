// Contact form: sends the message by email through FormSubmit (no server needed).
// The first message ever sent triggers an activation email to the address below: click "Activate" once.
(function () {
  const TO = 'contact@goual.fr';
  document.querySelectorAll('form.goual-contact').forEach(form => {
    const status = form.querySelector('.form-status'), button = form.querySelector('button[type=submit]');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (form.elements._honey && form.elements._honey.value) return;          // a bot filled the hidden field
      if (!form.checkValidity()) {                                              // e.g. an email without @
        form.reportValidity();
        status.className = 'form-status err'; status.textContent = 'Please fill in your name, a valid email address and your message.';
        return;
      }
      const data = Object.fromEntries(new FormData(form));
      delete data._honey;
      Object.assign(data, { _subject: `GOUAL ART — new message from ${data.name || data.email}`, _template: 'table', _captcha: 'false', _replyto: data.email });
      button.disabled = true; status.className = 'form-status'; status.textContent = 'Sending…';
      try {
        const res = await fetch(`https://formsubmit.co/ajax/${TO}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
        const json = await res.json().catch(() => ({}));
        if (/activat/i.test(json.message || '')) {                             // the form address has not been activated yet
          status.className = 'form-status err'; status.textContent = 'The form is not activated yet: the site owner must click the activation link sent by FormSubmit to ' + TO + '.';
          return;
        }
        if (!res.ok || String(json.success) === 'false') throw new Error(json.message || res.status);
        form.reset();
        status.className = 'form-status ok'; status.textContent = 'Thank you! Your message has been sent — we will get back to you soon.';
      } catch (err) {
        status.className = 'form-status err';
        status.innerHTML = `Sorry, the message could not be sent. Please write to us at <a href="mailto:${TO}">${TO}</a>.`;
      } finally { button.disabled = false; }
    });
  });
})();
