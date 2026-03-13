"""
STAGE 1A: Chunking (updated structure)
======================================

Split portfolio vault files into meaningful chunks.

Run:
  cd rag
  .\.venv\Scripts\python.exe scripts/01_chunk.py
"""

import sys
from pathlib import Path
import json
import re

# Add parent directory to path so portfolio_vault can be imported
sys.path.insert(0, str(Path(__file__).parent.parent))

from portfolio_vault.config import PROJECT_DIR, CHUNKS_FILE, print_config

VAULT_FILES = {
    "brag_sheet": PROJECT_DIR / "brag_sheet.md",
    "bio":        PROJECT_DIR / "bio.md",
    "skills":     PROJECT_DIR / "skills.md",
    "experience": PROJECT_DIR / "experience.md",
    "project_src_permit":    PROJECT_DIR / "02_projects/src-permit-system/overview.md",
    "project_laundry_kiosk": PROJECT_DIR / "02_projects/laundry-kiosk/overview.md",
    "project_laundry_pos":   PROJECT_DIR / "02_projects/laundry-pos/overview.md",
    "project_kgl":           PROJECT_DIR / "02_projects/kgl-group-website/overview.md",
    "project_allied":        PROJECT_DIR / "02_projects/allied-ghana-website/overview.md",
    "project_kitchen":       PROJECT_DIR / "02_projects/kitchen-comfort/overview.md",
    "project_csir":          PROJECT_DIR / "02_projects/csir-noise-dashboard/overview.md",
}


def split_by_headings(text: str) -> list[dict]:
    """Split a markdown file into sections based on ## headings."""
    parts = re.split(r'\n(?=#{1,3} )', text.strip())
    
    sections = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        
        lines = part.split('\n')
        heading = lines[0].lstrip('#').strip()
        content = part
        
        sections.append({
            "heading": heading,
            "content": content,
        })
    
    return sections


def word_count(text: str) -> int:
    return len(text.split())


def chunk_file(source_key: str, filepath: str) -> list[dict]:
    """Load a vault file and produce a list of chunks."""
    text = Path(filepath).read_text()
    sections = split_by_headings(text)
    
    chunks = []
    for i, section in enumerate(sections):
        wc = word_count(section["content"])
        
        if wc > 350:
            paragraphs = [p.strip() for p in section["content"].split('\n\n') if p.strip()]
            
            window = []
            window_wc = 0
            sub_idx = 0
            
            for para in paragraphs:
                para_wc = word_count(para)
                
                if window_wc + para_wc > 300 and window:
                    chunk_text = '\n\n'.join(window)
                    chunks.append({
                        "id": f"{source_key}__{i}_{sub_idx}",
                        "source": source_key,
                        "heading": section["heading"],
                        "content": chunk_text,
                        "word_count": word_count(chunk_text),
                    })
                    sub_idx += 1
                    window = [window[-1]] if window else []
                    window_wc = word_count(window[0]) if window else 0
                
                window.append(para)
                window_wc += para_wc
            
            if window:
                chunk_text = '\n\n'.join(window)
                chunks.append({
                    "id": f"{source_key}__{i}_{sub_idx}",
                    "source": source_key,
                    "heading": section["heading"],
                    "content": chunk_text,
                    "word_count": word_count(chunk_text),
                })
        else:
            chunks.append({
                "id": f"{source_key}__{i}_0",
                "source": source_key,
                "heading": section["heading"],
                "content": section["content"],
                "word_count": wc,
            })
    
    return chunks


if __name__ == "__main__":
    print_config()
    
    all_chunks = []
    
    for source_key, filepath in VAULT_FILES.items():
        chunks = chunk_file(source_key, filepath)
        all_chunks.extend(chunks)
        print(f"{source_key:30s} → {len(chunks):2d} chunks")
    
    print(f"\nTotal chunks: {len(all_chunks)}")
    print(f"Word count range: {min(c['word_count'] for c in all_chunks)} – {max(c['word_count'] for c in all_chunks)}")
    print(f"Average words per chunk: {sum(c['word_count'] for c in all_chunks) // len(all_chunks)}")
    
    # Save chunks
    with open(CHUNKS_FILE, "w") as f:
        json.dump(all_chunks, f, indent=2)
    
    print(f"\nSaved to {CHUNKS_FILE}")
    print("\nSample chunks:")
    for c in all_chunks[:3]:
        print(f"\n  [{c['id']}] ({c['word_count']} words)")
        print(f"  Heading: {c['heading']}")
        print(f"  Preview: {c['content'][:120].replace(chr(10), ' ')}...")
