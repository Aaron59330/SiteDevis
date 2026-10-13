'use strict';
/* Facture électronique (réforme française 2026-2027) : nouvelles mentions obligatoires, contrôle de conformité
   et fichier Factur-X (PDF + XML CII, profil EN 16931) prêt à déposer sur une plateforme agréée. */

(function () {
const OP_NATURE = { services: 'Prestation de services', biens: 'Livraison de biens', mixte: 'Mixte (biens et services)' };
const r2 = x => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
const a2 = x => r2(x).toFixed(2);
const dig = s => String(s || '').replace(/\D/g, '');
const x = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const d102 = d => String(d || '').replace(/-/g, '');
const sirenOf = s => { const d = dig(s); return d.length >= 9 ? d.slice(0, 9) : ''; };

/* « 12 rue des Lilas\n59000 LILLE\nFRANCE » -> { line, zip, city, country } */
function parseAddr(text) {
  const lines = String(text || '').split('\n').map(s => s.trim()).filter(Boolean);
  let zip = '', city = '', country = 'FR'; const rest = [];
  for (const l of lines) {
    const m = /^(\d{5})\s+(.+)$/.exec(l);
    if (m && !zip) { zip = m[1]; city = m[2]; continue; }
    if (/^france$/i.test(l)) continue;
    rest.push(l);
  }
  return { line: rest.join(', '), zip, city, country };
}

/* Acheteur : fiche client si elle existe, sinon le bloc client du document */
function buyerOf(q) {
  const c = getClient(q.clientId);
  if (c) return { name: c.name, address: c.address || '', siren: sirenOf(c.siret), siret: dig(c.siret), vat: c.vatNumber || '', email: c.email || '', pro: c.type === 'pro' || !!dig(c.siret) };
  const lines = String(q.clientText || '').split('\n'), txt = lines.join('\n');
  const sm = /SIRE[NT]\s*:?\s*([\d ]{9,20})/i.exec(txt), em = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.exec(txt);
  const addr = lines.slice(1).filter(l => !/:/.test(l) && !/@/.test(l)).join('\n');
  return { name: lines[0] || '', address: addr, siren: sm ? sirenOf(sm[1]) : '', siret: sm ? dig(sm[1]) : '', vat: '', email: em ? em[0] : '', pro: !!sm };
}

/* Montants de la facture électronique (arrondis à 2 décimales, cohérents entre eux) */
function eiAmounts(q) {
  const co = db.company, exempt = co.vatExempt;
  const items = q.lines.filter(l => l.t === 'item' && (num(l.qty) || num(l.price)));
  let lines, allowances = [];
  const rateOf = l => (exempt ? 0 : num(l.vat));
  if (num(q.stepPct) > 0) {                                                   // facture d'une échéance : une ligne par taux de TVA
    const t = totals(q);
    lines = Object.entries(t.htByRate).filter(([, v]) => Math.abs(v) > 0.004).map(([rate, ht]) => ({ ref: '', name: `${q.stepLabel ? 'Facture ' + q.stepLabel : 'Échéance'} – ${String(num(q.stepPct)).replace('.', ',')} % du devis${q.fromNumber ? ' N° ' + q.fromNumber : ''}`, qty: 1, unit: 'C62', price: r2(ht), net: r2(ht), rate: num(rate) }));
  } else {
    lines = items.map(l => ({ ref: l.ref || '', name: String(l.desc || '').trim() || 'Prestation', qty: num(l.qty), unit: unitCode(l.unit), price: num(l.price), net: r2(num(l.qty) * num(l.price)), rate: rateOf(l) }));
    if (num(q.discount) > 0) {
      const by = {}; lines.forEach(l => { by[l.rate] = (by[l.rate] || 0) + l.net; });
      allowances = Object.entries(by).map(([rate, base]) => ({ rate: num(rate), base: r2(base), amount: r2(base * num(q.discount) / 100), pct: num(q.discount) }));
    }
  }
  const lineTotal = r2(lines.reduce((s, l) => s + l.net, 0));
  const allowTotal = r2(allowances.reduce((s, a) => s + a.amount, 0));
  const rates = {};
  lines.forEach(l => { rates[l.rate] = (rates[l.rate] || 0) + l.net; });
  allowances.forEach(a => { rates[a.rate] = (rates[a.rate] || 0) - a.amount; });
  const taxes = Object.entries(rates).map(([rate, base]) => ({ rate: num(rate), base: r2(base), tax: r2(base * num(rate) / 100) }));
  const basis = r2(lineTotal - allowTotal), tax = r2(taxes.reduce((s, t) => s + t.tax, 0)), grand = r2(basis + tax);
  const paid = r2(num(q.alreadyPaid));
  return { lines, allowances, taxes, lineTotal, allowTotal, basis, tax, grand, paid, due: r2(grand - paid) };
}
function unitCode(u) {
  const k = String(u || '').toLowerCase().replace(/\s|\(|\)|\./g, '');
  return { m2: 'MTK', 'm²': 'MTK', m3: 'MTQ', 'm³': 'MTQ', ml: 'MTR', m: 'MTR', h: 'HUR', heure: 'HUR', heures: 'HUR', jour: 'DAY', jours: 'DAY', j: 'DAY', kg: 'KGM', l: 'LTR', litre: 'LTR', mois: 'MON', forfait: 'C62', lot: 'C62', u: 'C62', pièces: 'C62', pièce: 'C62', 'pièce(s)': 'C62', personne: 'C62' }[k] || 'C62';
}

/* Contrôle : erreurs (bloquantes) et remarques */
function eiCheck(q) {
  const co = db.company, err = [], warn = [], b = buyerOf(q), sa = parseAddr(co.address), ba = parseAddr(b.address);
  if (!co.name) err.push('Nom de votre entreprise (Mon entreprise)');
  if (dig(co.siret).length !== 14) err.push('SIRET de votre entreprise, 14 chiffres (Mon entreprise)');
  if (!sa.zip || !sa.city) err.push('Adresse de votre entreprise avec code postal et ville (Mon entreprise)');
  if (!co.vatExempt && !/^[A-Z]{2}[0-9A-Z]{2,13}$/.test(String(co.vatNumber || '').replace(/\s/g, ''))) err.push('N° de TVA intracommunautaire de votre entreprise (Mon entreprise)');
  if (!String(q.number || '').trim()) err.push('Numéro de facture');
  if (!q.date) err.push('Date de la facture');
  if (!q.dueDate) err.push('Échéance de paiement');
  if (!b.name) err.push('Nom du client');
  if (!ba.zip || !ba.city) err.push('Adresse du client avec code postal et ville');
  if (b.pro && !b.siren) err.push('SIREN ou SIRET du client professionnel (nouvelle mention obligatoire)');
  if (!b.pro && !b.email) err.push('Email du client particulier (adresse électronique demandée par la facture électronique)');
  if (String(q.number || '').length > 35 || /[^A-Za-z0-9\-_./+ ]/.test(String(q.number || ''))) err.push('Numéro de facture : 35 caractères maximum, lettres, chiffres et - _ . / uniquement');
  const okRates = [0, 2.1, 5.5, 7, 8.5, 10, 13, 20]; if (!co.vatExempt && q.lines.some(l => l.t === 'item' && !okRates.includes(num(l.vat)))) err.push('Taux de TVA non reconnu en France sur une ligne (0 ; 2,1 ; 5,5 ; 10 ; 20 %…)');
  if (!eiAmounts(q).lines.length) err.push('Au moins une ligne facturée');
  if (q.totalOverride !== '' && q.totalOverride != null) err.push('Total modifié à la main : une facture électronique doit avoir des montants calculés. Videz le champ « Total TTC modifié ».');
  if (!b.pro) warn.push('Client particulier : la facture électronique n’est pas obligatoire (vos ventes aux particuliers sont déclarées par l’e-reporting). Vous pouvez quand même produire le Factur-X.');
  if (!/IBAN\s*:?\s*[A-Z]{2}\d{2}/i.test(co.bank || q.bank || '')) warn.push('IBAN absent des coordonnées bancaires : le moyen de paiement ne sera pas détaillé.');
  if (!co.vatExempt && q.lines.some(l => l.t === 'item' && num(l.vat) === 0)) warn.push('Des lignes sont à 0 % de TVA : elles seront déclarées « exonérées ». Vérifiez le motif (autoliquidation, exonération…).');
  return { ok: !err.length, err, warn, buyer: b };
}

/* Fichier XML CII — profil Factur-X EN 16931 */
function ciiXml(q) {
  const co = db.company, a = eiAmounts(q), b = buyerOf(q), sa = parseAddr(co.address), ba = parseAddr(b.address), exempt = co.vatExempt;
  const cat = r => (exempt ? 'O' : r > 0 ? 'S' : 'E');
  const rateXml = r => (exempt ? '' : `<ram:RateApplicablePercent>${r}</ram:RateApplicablePercent>`);
  const reason = 'TVA non applicable, art. 293 B du CGI';
  const zeroReason = exempt ? reason : 'Exonération de TVA';
  const iban = (/IBAN\s*:?\s*([A-Z]{2}\d{2}[A-Z0-9 ]{10,40})/i.exec(co.bank || q.bank || '') || [])[1];
  const addr = (p) => `<ram:PostalTradeAddress><ram:PostcodeCode>${x(p.zip)}</ram:PostcodeCode>${p.line ? `<ram:LineOne>${x(p.line)}</ram:LineOne>` : ''}<ram:CityName>${x(p.city)}</ram:CityName><ram:CountryID>${p.country}</ram:CountryID></ram:PostalTradeAddress>`;
  const notes = [];
  const txd = exempt ? reason : co.vatDebits ? 'Option pour le paiement de la TVA d’après les débits.' : '';
  if (txd) notes.push(['TXD', txd]);
  notes.push(['PMD', 'Pénalités de retard : taux d’intérêt de la Banque centrale européenne majoré de 10 points, exigibles dès le lendemain de la date d’échéance.']);
  notes.push(['PMT', 'Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40 € (art. L441-10 du Code de commerce).']);
  notes.push(['AAB', 'Pas d’escompte pour paiement anticipé.']);
  notes.push(['AAI', 'Nature de l’opération : ' + (OP_NATURE[q.opNature] || OP_NATURE.services)]);
  notes.push(['BAR', b.pro ? 'B2B' : 'B2C']);
  const frame = ({ biens: 'B', mixte: 'M' }[q.opNature] || 'S') + (q.status === 'payee' && a.due <= 0.004 ? '2' : '1');
  const lineXml = a.lines.map((l, i) => `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>${l.ref ? `<ram:SellerAssignedID>${x(l.ref)}</ram:SellerAssignedID>` : ''}<ram:Name>${x(l.name.replace(/\s*\n\s*/g, ' ').slice(0, 500))}</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${+l.price.toFixed(4)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${l.unit}">${+l.qty.toFixed(4)}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${cat(l.rate)}</ram:CategoryCode>${rateXml(l.rate)}</ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${a2(l.net)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`).join('');
  const taxXml = a.taxes.map(t => `
      <ram:ApplicableTradeTax><ram:CalculatedAmount>${a2(t.tax)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode>${t.rate > 0 ? '' : `<ram:ExemptionReason>${x(zeroReason)}</ram:ExemptionReason>`}<ram:BasisAmount>${a2(t.base)}</ram:BasisAmount><ram:CategoryCode>${cat(t.rate)}</ram:CategoryCode>${exempt ? '<ram:ExemptionReasonCode>VATEX-EU-O</ram:ExemptionReasonCode>' : ''}${t.rate > 0 && co.vatDebits ? '<ram:DueDateTypeCode>5</ram:DueDateTypeCode>' : ''}${rateXml(t.rate)}</ram:ApplicableTradeTax>`).join('');
  const allowXml = a.allowances.map(al => `
      <ram:SpecifiedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator><ram:CalculationPercent>${al.pct}</ram:CalculationPercent><ram:BasisAmount>${a2(al.base)}</ram:BasisAmount><ram:ActualAmount>${a2(al.amount)}</ram:ActualAmount><ram:Reason>Remise</ram:Reason><ram:CategoryTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${cat(al.rate)}</ram:CategoryCode>${rateXml(al.rate)}</ram:CategoryTradeTax></ram:SpecifiedTradeAllowanceCharge>`).join('');
  const del = String(q.deliveryAddress || '').trim() ? parseAddr(q.deliveryAddress) : null;
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>${frame}</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter>
    <ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${x(q.number)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${d102(q.date)}</udt:DateTimeString></ram:IssueDateTime>${notes.map(([c, t]) => `
    <ram:IncludedNote><ram:Content>${x(t)}</ram:Content><ram:SubjectCode>${c}</ram:SubjectCode></ram:IncludedNote>`).join('')}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lineXml}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${x(co.name)}</ram:Name>
        <ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${sirenOf(co.siret)}</ram:ID></ram:SpecifiedLegalOrganization>
        ${addr(sa)}<ram:URIUniversalCommunication><ram:URIID schemeID="0225">${sirenOf(co.siret)}</ram:URIID></ram:URIUniversalCommunication>${!exempt && co.vatNumber ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${x(String(co.vatNumber).replace(/\s/g, ''))}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${x(b.name)}</ram:Name>${b.siren ? `
        <ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${b.siren}</ram:ID></ram:SpecifiedLegalOrganization>` : ''}
        ${addr(ba)}${b.siren ? `<ram:URIUniversalCommunication><ram:URIID schemeID="0225">${b.siren}</ram:URIID></ram:URIUniversalCommunication>` : b.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${x(b.email)}</ram:URIID></ram:URIUniversalCommunication>` : ''}${b.vat ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${x(String(b.vat).replace(/\s/g, ''))}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}
      </ram:BuyerTradeParty>${q.fromNumber ? `
      <ram:ContractReferencedDocument><ram:IssuerAssignedID>${x('Devis ' + q.fromNumber)}</ram:IssuerAssignedID></ram:ContractReferencedDocument>` : ''}
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>${del ? `
      <ram:ShipToTradeParty><ram:Name>${x(b.name)}</ram:Name>${addr(del)}</ram:ShipToTradeParty>` : ''}${q.serviceDate ? `
      <ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">${d102(q.serviceDate)}</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>` : ''}
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:PaymentReference>${x(q.number)}</ram:PaymentReference>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>${iban ? `
      <ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${iban.replace(/\s/g, '').toUpperCase()}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>` : ''}${taxXml}${allowXml}
      <ram:SpecifiedTradePaymentTerms>${q.payMethod ? `<ram:Description>${x(q.payMethod)}</ram:Description>` : ''}${q.dueDate ? `<ram:DueDateDateTime><udt:DateTimeString format="102">${d102(q.dueDate)}</udt:DateTimeString></ram:DueDateDateTime>` : ''}</ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${a2(a.lineTotal)}</ram:LineTotalAmount>
        <ram:ChargeTotalAmount>0.00</ram:ChargeTotalAmount>
        <ram:AllowanceTotalAmount>${a2(a.allowTotal)}</ram:AllowanceTotalAmount>
        <ram:TaxBasisTotalAmount>${a2(a.basis)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${a2(a.tax)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${a2(a.grand)}</ram:GrandTotalAmount>
        <ram:TotalPrepaidAmount>${a2(a.paid)}</ram:TotalPrepaidAmount>
        <ram:DuePayableAmount>${a2(a.due)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}

/* ---------- Affichage ---------- */
/* Mentions ajoutées sur le document (factures) */
function eiDocLine(q) {
  if (!isInv(q)) return '';
  const b = buyerOf(q), parts = [];
  parts.push(`Nature de l’opération : ${OP_NATURE[q.opNature] || OP_NATURE.services}`);
  if (b.siren) parts.push(`SIREN du client : ${b.siren.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}`);
  if (String(q.deliveryAddress || '').trim()) parts.push(`Adresse de livraison : ${esc(String(q.deliveryAddress).trim().replace(/\n+/g, ', '))}`);
  if (db.company.vatDebits && !db.company.vatExempt) parts.push('Option pour le paiement de la TVA d’après les débits');
  return `<div class="dmeta ei-meta">${parts.map(p => `<span>${p}</span>`).join('')}</div>`;
}

/* Carte dans l'éditeur de facture */
function eiCard(q) {
  if (!isInv(q)) return '';
  const c = eiCheck(q), cfg = session.config || {};
  return `<div class="card" id="eiCard"><h2>Facture électronique</h2>
    <p class="muted" style="margin:-4px 0 12px;font-size:.84rem">Réforme de la facturation électronique : réception obligatoire pour toutes les entreprises depuis septembre 2026, émission obligatoire pour les TPE-PME à partir de septembre 2027. OptiDevis produit le format <b>Factur-X</b> (PDF lisible + données XML) accepté par les plateformes agréées.</p>
    <div class="grid2">
      <div class="field"><label>Nature de l’opération</label><select data-f="opNature">${Object.entries(OP_NATURE).map(([k, v]) => `<option value="${k}" ${(q.opNature || 'services') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label>Adresse de livraison (si différente)</label><textarea class="auto" rows="1" data-f="deliveryAddress" placeholder="Ex : 3 rue du Chantier&#10;59100 ROUBAIX">${esc(q.deliveryAddress || '')}</textarea></div>
    </div>
    <div id="eiStatus">${eiStatusHtml(c)}</div>
    <div class="row" style="margin-top:12px;flex-wrap:wrap">
      <button class="btn primary" data-act="ei-facturx" ${c.ok && cfg.einvoice ? '' : 'disabled'} title="PDF/A-3 contenant le fichier XML de la facture">⬇ Télécharger le Factur-X</button>
      <button class="btn" data-act="ei-xml" ${c.ok ? '' : 'disabled'} title="Données structurées de la facture (CII, EN 16931)">⬇ XML seul</button>
    </div>
    ${cfg.einvoice ? '' : '<p class="muted" style="font-size:.8rem;margin:8px 0 0">La création du Factur-X n’est pas disponible sur ce serveur (moteur PDF absent) : le XML seul reste téléchargeable.</p>'}
    <p class="muted" style="font-size:.8rem;margin:10px 0 0">À partir de l’obligation d’émission, la facture doit être transmise par une <b>plateforme agréée</b> par l’administration : déposez-y ce fichier Factur-X (ou envoyez-le si votre plateforme le récupère par email).</p>
  </div>`;
}
function eiStatusHtml(c) {
  return (c.ok ? '<div class="notice ok" style="margin:6px 0">✓ Prête pour la facture électronique.</div>'
    : `<div class="notice bad" style="margin:6px 0"><b>À compléter avant la facture électronique :</b><ul style="margin:6px 0 0 18px">${c.err.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>`)
    + (c.warn.length ? `<div class="muted" style="font-size:.8rem">${c.warn.map(w => '• ' + esc(w)).join('<br>')}</div>` : '');
}
function eiRefresh() { const q = getQuote(editingId), el = $('#eiStatus'); if (!q || !el) return; const c = eiCheck(q); el.innerHTML = eiStatusHtml(c); const f = $('[data-act=ei-facturx]'), xb = $('[data-act=ei-xml]'); if (f) f.disabled = !(c.ok && session.config.einvoice); if (xb) xb.disabled = !c.ok; }

const fileName = q => `${q.opts.docLabel}-${q.number}`.replace(/[^\w.\- ]+/g, '');
function saveBlob(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); }

Object.assign(actions, {
  'ei-xml'() { const q = getQuote(editingId); if (!q) return; const c = eiCheck(q); if (!c.ok) return toast('Complétez d’abord : ' + c.err[0]); saveBlob(new Blob([ciiXml(q)], { type: 'application/xml' }), fileName(q) + '-factur-x.xml'); toast('XML téléchargé'); },
  async 'ei-facturx'(t) {
    const q = getQuote(editingId); if (!q) return; const c = eiCheck(q); if (!c.ok) return toast('Complétez d’abord : ' + c.err[0]);
    const old = t.innerHTML; t.disabled = true; t.textContent = 'Création du Factur-X…';
    try {
      const r = await fetch('/api/facturx', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'sitedevis' },
        body: JSON.stringify({ html: $('#doc').innerHTML, accent: accentOf(), label: `${q.opts.docLabel} N° ${q.number}`, date: flongdate(q.date), filename: fileName(q), xml: ciiXml(q), title: `${q.opts.docLabel} ${q.number}`, author: db.company.name }) });
      if (!r.ok) { let m = ''; try { m = (await r.json()).error; } catch (e) { /* ignore */ } throw new Error(m || 'Erreur ' + r.status); }
      saveBlob(await r.blob(), fileName(q) + '-facturx.pdf'); toast('Facture électronique Factur-X téléchargée');
    } catch (e) { toast('Factur-X impossible : ' + e.message); }
    t.disabled = false; t.innerHTML = old;
  }
});
document.addEventListener('input', e => { if (view === 'editor' && e.target.closest && (e.target.dataset.f || e.target.dataset.l)) setTimeout(eiRefresh, 0); });
document.addEventListener('change', e => { if (view === 'editor' && e.target.dataset && e.target.dataset.f) setTimeout(eiRefresh, 0); });
Object.assign(window, { eiCard, eiDocLine, eiCheck, ciiXml, eiAmounts });
})();
