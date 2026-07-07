export function fillDatalist(datalist: HTMLDataListElement, options: readonly string[], labelFor?: (value: string) => string): void {
  datalist.innerHTML = '';
  for (const opt of options) {
    const option = document.createElement('option');
    option.value = opt;
    if (labelFor) option.textContent = labelFor(opt);
    datalist.appendChild(option);
  }
}
