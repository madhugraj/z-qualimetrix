#!/usr/bin/env node

/**
 * QualiMetrix Diagram Generator
 * Converts Mermaid diagrams in markdown files to PNG/SVG images
 *
 * Prerequisites:
 * npm install -g @mermaid-js/mermaid-cli
 *
 * Usage:
 * node scripts/generate-diagrams.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIAGRAMS_DIR = path.join(__dirname, '../diagrams');
const OUTPUT_DIR = path.join(__dirname, '../diagrams/images');

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('🎨 Generating QualiMetrix Diagrams...\n');

// Diagram files to process
const diagramFiles = [
  'er-diagram.md',
  'dfd-levels.md',
  'system-architecture-summary.md'
];

/**
 * Extract Mermaid code from markdown file
 */
function extractMermaidCode(markdownContent) {
  const mermaidBlocks = [];
  const regex = /```mermaid\n([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(markdownContent)) !== null) {
    mermaidBlocks.push(match[1].trim());
  }

  return mermaidBlocks;
}

/**
 * Generate diagram image using mermaid-cli
 */
function generateDiagram(mermaidCode, outputFile, format = 'png') {
  const tempFile = path.join(OUTPUT_DIR, 'temp.mmd');

  try {
    // Write temporary mermaid file
    fs.writeFileSync(tempFile, mermaidCode);

    // Generate diagram
    const command = `mmdc -i ${tempFile} -o ${outputFile} -t default -b transparent`;
    console.log(`   Generating: ${path.basename(outputFile)}`);

    execSync(command, { stdio: 'inherit' });

    // Clean up temp file
    fs.unlinkSync(tempFile);

    return true;
  } catch (error) {
    console.error(`   ❌ Error generating ${outputFile}:`, error.message);

    // Clean up temp file if it exists
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }

    return false;
  }
}

/**
 * Process all diagram files
 */
async function processDiagrams() {
  let totalGenerated = 0;
  let totalErrors = 0;

  for (const file of diagramFiles) {
    const filePath = path.join(DIAGRAMS_DIR, file);

    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${file}`);
      continue;
    }

    console.log(`\n📄 Processing: ${file}`);

    const markdownContent = fs.readFileSync(filePath, 'utf8');
    const mermaidBlocks = extractMermaidCode(markdownContent);

    console.log(`   Found ${mermaidBlocks.length} Mermaid diagram(s)`);

    if (mermaidBlocks.length === 0) {
      console.log(`   ⚠️  No Mermaid diagrams found in ${file}`);
      continue;
    }

    // Generate individual diagrams
    mermaidBlocks.forEach((mermaidCode, index) => {
      const baseName = path.basename(file, '.md');
      const outputFile = path.join(OUTPUT_DIR, `${baseName}-${index + 1}.png`);

      if (generateDiagram(mermaidCode, outputFile)) {
        totalGenerated++;
      } else {
        totalErrors++;
      }
    });
  }

  console.log(`\n✅ Diagram Generation Complete!`);
  console.log(`   📊 Total diagrams generated: ${totalGenerated}`);
  console.log(`   ❌ Errors: ${totalErrors}`);
  console.log(`   💾 Output directory: ${OUTPUT_DIR}`);
}

// Alternative method using mermaid-js npm package
async function generateWithMermaidJS() {
  console.log('🔄 Using alternative method with mermaid-js...\n');

  const { mermaid } = require('mermaid');

  // Initialize mermaid
  mermaid.initialize({
    startOnLoad: true,
    theme: 'default',
    securityLevel: 'loose',
  });

  for (const file of diagramFiles) {
    const filePath = path.join(DIAGRAMS_DIR, file);

    if (!fs.existsSync(filePath)) {
      continue;
    }

    console.log(`📄 Processing: ${file}`);

    const markdownContent = fs.readFileSync(filePath, 'utf8');
    const mermaidBlocks = extractMermaidCode(markdownContent);

    for (let index = 0; index < mermaidBlocks.length; index++) {
      const mermaidCode = mermaidBlocks[index];
      const baseName = path.basename(file, '.md');
      const outputFile = path.join(OUTPUT_DIR, `${baseName}-${index + 1}.svg`);

      try {
        console.log(`   Generating: ${baseName}-${index + 1}.svg`);

        // Render SVG
        const svg = await mermaid.render(`mermaid-${Date.now()}`, mermaidCode);

        // Clean up mermaid-generated HTML wrapper
        const svgContent = svg.match(/<svg[\s\S]*<\/svg>/)[0];

        // Write SVG file
        fs.writeFileSync(outputFile, svgContent);

        console.log(`   ✅ Generated: ${outputFile}`);
      } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
      }
    }
  }

  console.log('\n✅ Diagram generation complete!');
}

// Main execution
(async () => {
  try {
    // Check if mermaid-cli is installed
    execSync('which mmdc', { stdio: 'ignore' });

    // Use mermaid-cli method
    await processDiagrams();
  } catch (error) {
    console.log('⚠️  mermaid-cli not found, trying alternative method...\n');

    try {
      // Try alternative method
      await generateWithMermaidJS();
    } catch (error) {
      console.error('❌ Error:', error.message);
      console.log('\n💡 To install mermaid-cli, run:');
      console.log('   npm install -g @mermaid-js/mermaid-cli');
    }
  }
})();