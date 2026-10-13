'use strict';
/* Facture électronique Factur-X (profil EN 16931) : le PDF de la facture devient un PDF/A-3
   qui contient le fichier XML structuré « factur-x.xml » (norme CII), lisible par les plateformes agréées. */
const fs = require('fs');
const path = require('path');

let lib = null;
try { lib = require('pdf-lib'); } catch (e) { /* module absent */ }
const ICC = (() => { try { return fs.readFileSync(path.join(__dirname, 'assets', 'sRGB.icc')); } catch (e) { return null; } })();
const available = () => !!lib && !!ICC;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const isoDate = d => d.toISOString().replace(/\.\d{3}Z$/, '+00:00');

function xmp({ title, author, now, level }) {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:format>application/pdf</dc:format>
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(title)}</rdf:li></rdf:Alt></dc:title>
   <dc:creator><rdf:Seq><rdf:li>${esc(author)}</rdf:li></rdf:Seq></dc:creator>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/"><pdf:Producer>OptiDevis</pdf:Producer></rdf:Description>
  <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
   <xmp:CreatorTool>OptiDevis</xmp:CreatorTool><xmp:CreateDate>${now}</xmp:CreateDate><xmp:ModifyDate>${now}</xmp:ModifyDate><xmp:MetadataDate>${now}</xmp:MetadataDate>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
   <fx:DocumentType>INVOICE</fx:DocumentType><fx:DocumentFileName>factur-x.xml</fx:DocumentFileName><fx:Version>1.0</fx:Version><fx:ConformanceLevel>${level}</fx:ConformanceLevel>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
   <pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource">
    <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
    <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
    <pdfaSchema:prefix>fx</pdfaSchema:prefix>
    <pdfaSchema:property><rdf:Seq>
     <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentFileName</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The name of the embedded XML document</pdfaProperty:description></rdf:li>
     <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentType</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The type of the hybrid document in capital letters, e.g. INVOICE or ORDER</pdfaProperty:description></rdf:li>
     <rdf:li rdf:parseType="Resource"><pdfaProperty:name>Version</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The actual version of the standard applying to the embedded XML document</pdfaProperty:description></rdf:li>
     <rdf:li rdf:parseType="Resource"><pdfaProperty:name>ConformanceLevel</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The conformance level of the embedded XML document</pdfaProperty:description></rdf:li>
    </rdf:Seq></pdfaSchema:property>
   </rdf:li></rdf:Bag></pdfaExtension:schemas>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/* pdf : Buffer du PDF de la facture ; xml : texte du factur-x.xml */
async function make(pdf, xml, o = {}) {
  const { PDFDocument, PDFName, PDFString, PDFHexString, PDFArray, AFRelationship } = lib;
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const now = new Date(), title = o.title || 'Facture', author = o.author || 'OptiDevis';
  doc.setTitle(title, { showInWindowTitleBar: true }); doc.setAuthor(author); doc.setCreator('OptiDevis'); doc.setProducer('OptiDevis');
  doc.setCreationDate(now); doc.setModificationDate(now); doc.setLanguage('fr-FR');
  await doc.attach(Buffer.from(xml, 'utf8'), 'factur-x.xml', { mimeType: 'text/xml', description: 'Factur-X Invoice', creationDate: now, modificationDate: now, afRelationship: AFRelationship.Data });
  const ctx = doc.context, cat = doc.catalog;
  // /AF du catalogue : pointe vers la pièce jointe XML
  const names = cat.lookup(PDFName.of('Names')), ef = names && names.lookup(PDFName.of('EmbeddedFiles')), arr = ef && ef.lookup(PDFName.of('Names'));
  if (arr) { const af = PDFArray.withContext(ctx); for (let i = 1; i < arr.size(); i += 2) af.push(arr.get(i)); cat.set(PDFName.of('AF'), af); }
  // profil couleur sRGB (intention de sortie PDF/A)
  const icc = ctx.flateStream(ICC, { N: 3 });
  const iccRef = ctx.register(icc);
  cat.set(PDFName.of('OutputIntents'), ctx.obj([ctx.obj({ Type: 'OutputIntent', S: 'GTS_PDFA1', OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'), Info: PDFString.of('sRGB IEC61966-2.1'), DestOutputProfile: iccRef })]));
  // métadonnées XMP (PDF/A-3 + Factur-X)
  const meta = ctx.stream(Buffer.from(xmp({ title, author, now: isoDate(now), level: o.level || 'EN 16931' }), 'utf8'), { Type: 'Metadata', Subtype: 'XML' });
  cat.set(PDFName.of('Metadata'), ctx.register(meta));
  cat.set(PDFName.of('MarkInfo'), ctx.obj({ Marked: true }));
  // identifiant du fichier
  const id = PDFHexString.of(require('crypto').randomBytes(16).toString('hex'));
  ctx.trailerInfo.ID = ctx.obj([id, id]);
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

/* Contrôle minimal du XML reçu du navigateur */
function checkXml(xml) {
  return typeof xml === 'string' && xml.length > 200 && xml.length < 800000 && /^<\?xml/.test(xml) && xml.includes('<rsm:CrossIndustryInvoice') && !/<!DOCTYPE|<!ENTITY/i.test(xml);
}

module.exports = { available, make, checkXml };
