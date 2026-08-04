const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, '../app');

function findAndReplace(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            findAndReplace(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes('FlatList') && !content.includes('FlashList')) {
                // Replace import
                content = content.replace(/FlatList,\s?/g, '');
                content = content.replace(/,\s*FlatList/g, '');
                content = content.replace(/import\s+{\s*FlatList\s*}\s+from\s+['"]react-native['"];?\n?/g, '');
                
                // Add FlashList import
                const importMatch = content.match(/import .* from 'react-native';/);
                if (importMatch) {
                    content = content.replace(importMatch[0], `${importMatch[0]}\nimport { FlashList } from '@shopify/flash-list';`);
                } else {
                    content = `import { FlashList } from '@shopify/flash-list';\n` + content;
                }

                // Replace <FlatList to <FlashList and add estimatedItemSize if not present
                content = content.replace(/<FlatList/g, '<FlashList estimatedItemSize={100}');
                content = content.replace(/<\/FlatList>/g, '</FlashList>');

                fs.writeFileSync(fullPath, content, 'utf8');
                console.log(`Updated ${fullPath}`);
            }
        }
    }
}

findAndReplace(directoryPath);
