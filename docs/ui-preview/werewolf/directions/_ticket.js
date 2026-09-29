/* 票根卡结构：号码成为票根，其余包进 .body */
function ticketize(el) {
  el.classList.add('ticket');
  const no = el.querySelector('.no');
  no.innerHTML = `<small>SEAT</small>${no.textContent}`;
  const body = document.createElement('span');
  body.className = 'body';
  body.append(el.querySelector('.ava'), el.querySelector('.txt'));
  no.after(body);
  return el;
}

