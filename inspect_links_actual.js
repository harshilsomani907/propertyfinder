const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, 'propertyfinder_detailed_properties.xlsx');
console.log('Reading file:', filePath);

try {
  const workbook = xlsx.readFile(filePath, { sheetRows: 5 });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  const range = xlsx.utils.decode_range(worksheet['!ref']);
  console.log('Sheet Range:', worksheet['!ref']);
  
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const colName = xlsx.utils.encode_col(C);
    const headerCell = worksheet[`${colName}1`];
    const headerVal = headerCell ? headerCell.v : '';
    
    if (headerVal === 'Link' || headerVal === 'Image Link' || headerVal === 'Photo') {
      const dataCell = worksheet[`${colName}2`];
      if (dataCell) {
        console.log(`Column ${colName} (Header: "${headerVal}"):`);
        console.log(`  Value:`, dataCell.v);
        console.log(`  Cell properties keys:`, Object.keys(dataCell));
        if (dataCell.l) {
          console.log(`  Link Target:`, dataCell.l.Target);
          console.log(`  Link Object:`, JSON.stringify(dataCell.l, null, 2));
        } else {
          console.log(`  No link (.l) property found`);
        }
      }
    }
  }
} catch (error) {
  console.error('Error:', error);
}
