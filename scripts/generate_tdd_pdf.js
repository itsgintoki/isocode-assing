const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function generateTddPdf() {
  const tddMdPath = path.join(__dirname, '../docs/TDD.md');
  const outputPdfPath = path.join(__dirname, '../docs/TDD.pdf');

  console.log('Generating Technical Design Document PDF from:', tddMdPath);
  const content = fs.readFileSync(tddMdPath, 'utf-8');
  const lines = content.split('\n');

  const doc = new PDFDocument({
    margin: 45,
    size: 'A4',
    bufferPages: true,
    info: {
      Title: 'Company A - Technical Design Document',
      Author: 'Software Engineering Candidate',
      Subject: 'AI Resume Screening Tool & Client Shortlist Portal'
    }
  });

  const writeStream = fs.createWriteStream(outputPdfPath);
  doc.pipe(writeStream);

  // Document Title & Header
  doc.rect(40, 40, doc.page.width - 80, 70).fill('#1e3a8a');
  doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold')
     .text('Company A Staffing, Noida', 55, 52);
  doc.fontSize(12).font('Helvetica')
     .text('AI Resume Screening Tool & Client Shortlist Portal — Technical Design Document', 55, 76);

  doc.moveDown(4.5);
  doc.fillColor('#0f172a');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      doc.moveDown(0.4);
      continue;
    }

    // Skip YAML frontmatter or top title if repeated
    if (line.startsWith('# Technical Design Document')) continue;

    // Check for page overflow
    if (doc.y > doc.page.height - 70) {
      doc.addPage();
    }

    if (line.startsWith('## ')) {
      doc.moveDown(0.8);
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#1e3a8a')
         .text(line.replace('## ', ''));
      doc.moveDown(0.3);
      // Horizontal separator line
      doc.strokeColor('#cbd5e1').lineWidth(0.8)
         .moveTo(doc.page.margins.left, doc.y)
         .lineTo(doc.page.width - doc.page.margins.right, doc.y)
         .stroke();
      doc.moveDown(0.4);
      doc.fillColor('#0f172a');
    } else if (line.startsWith('### ')) {
      doc.moveDown(0.6);
      doc.fontSize(11.5).font('Helvetica-Bold').fillColor('#2563eb')
         .text(line.replace('### ', ''));
      doc.moveDown(0.2);
      doc.fillColor('#0f172a');
    } else if (line.startsWith('- **') || line.startsWith('* **')) {
      doc.fontSize(9.5).font('Helvetica')
         .text('•  ' + line.replace(/^[-*]\s*/, ''), { indent: 12 });
      doc.moveDown(0.2);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      doc.fontSize(9.5).font('Helvetica')
         .text('•  ' + line.replace(/^[-*]\s*/, ''), { indent: 12 });
      doc.moveDown(0.2);
    } else if (line.startsWith('|')) {
      // Table row formatting
      doc.fontSize(8.5).font('Courier')
         .text(line, { indent: 8 });
      doc.moveDown(0.15);
    } else if (line.startsWith('```')) {
      doc.fontSize(8.5).font('Courier-Oblique').fillColor('#475569')
         .text('--- [Diagram / Code Block] ---', { indent: 10 });
      doc.moveDown(0.2);
      doc.fillColor('#0f172a');
    } else {
      doc.fontSize(9.5).font('Helvetica')
         .text(line, { lineGap: 1.5 });
      doc.moveDown(0.2);
    }
  }

  // Footer on each page
  const totalPages = doc.bufferedPageRange().count;
  for (let p = 0; p < totalPages; p++) {
    doc.switchToPage(p);
    doc.fontSize(8).fillColor('#94a3b8')
       .text(`Company A Staffing • AI Resume Screening TDD • Page ${p + 1} of ${totalPages}`, 45, doc.page.height - 35, {
         align: 'center',
         width: doc.page.width - 90
       });
  }

  doc.end();

  writeStream.on('finish', () => {
    console.log('TDD.pdf successfully generated at:', outputPdfPath);
  });
}

if (require.main === module) {
  generateTddPdf();
}

module.exports = { generateTddPdf };
