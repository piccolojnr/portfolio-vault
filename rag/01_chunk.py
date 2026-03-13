"""
STAGE 1A: Chunking
==================
Goal: Split your vault files into small, meaningful pieces.

Why does chunk SIZE matter?
- Too large: you retrieve a whole file when you only needed one paragraph.
  The LLM gets irrelevant context, costs more tokens, answers get worse.
- Too small: you retrieve a sentence with no surrounding context.
  "165,100 GHS processed" with nothing around it is useless.

Sweet spot for prose: 200-400 words per chunk, with ~50 word overlap
between consecutive chunks so ideas that span a boundary aren't lost.

We'll also do something smarter: split on MARKDOWN HEADINGS first.
Your vault files have natural sections (## What I did, ## Results, etc.)
These are better boundaries than arbitrary word counts.
"""

import os
import json
import re
from pathlib import Path

# project path
PROJECT_PATH = Path(__file__).parent.parent 

VAULT_FILES = {
    "brag_sheet": f"{PROJECT_PATH}/brag_sheet.md",
    "bio":        f"{PROJECT_PATH}/bio.md",
    "skills":     f"{PROJECT_PATH}/skills.md",
    "experience": f"{PROJECT_PATH}/experience.md",
    "project_src_permit":    f"{PROJECT_PATH}/02_projects/src-permit-system/overview.md",
    "project_laundry_kiosk": f"{PROJECT_PATH}/02_projects/laundry-kiosk/overview.md",
    "project_laundry_pos":   f"{PROJECT_PATH}/02_projects/laundry-pos/overview.md",
    "project_kgl":           f"{PROJECT_PATH}/02_projects/kgl-group-website/overview.md",
    "project_allied":        f"{PROJECT_PATH}/02_projects/allied-ghana-website/overview.md",
    "project_kitchen":       f"{PROJECT_PATH}/02_projects/kitchen-comfort/overview.md",
    "project_csir":          f"{PROJECT_PATH}/02_projects/csir-noise-dashboard/overview.md",
}


def split_by_headings(text: str) -> list[dict]:
    """
    Split a markdown file into sections based on ## headings.
    Each section becomes one candidate chunk.
    Returns list of {heading, content} dicts.
    """
    # Split on lines that start with ## (level 2 headings)
    # We keep the heading as part of the chunk for context
    parts = re.split(r'\n(?=#{1,3} )', text.strip())
    
    sections = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        
        # Extract the heading (first line)
        lines = part.split('\n')
        heading = lines[0].lstrip('#').strip()
        content = part  # keep the whole thing including heading
        
        sections.append({
            "heading": heading,
            "content": content,
        })
    
    return sections


def word_count(text: str) -> int:
    return len(text.split())


def chunk_file(source_key: str, filepath: str) -> list[dict]:
    """
    Load a vault file and produce a list of chunks.
    Each chunk is a dict with everything needed to reconstruct context later:
    {
        id:       unique string (used as the key in ChromaDB)
        source:   which file it came from
        heading:  the section heading (useful for debugging retrieval)
        content:  the actual text that gets embedded
        word_count: so we can see what sizes we're producing
    }
    """
    text = Path(filepath).read_text()
    sections = split_by_headings(text)
    
    chunks = []
    for i, section in enumerate(sections):
        wc = word_count(section["content"])
        
        # If a section is very long (>350 words), split it further
        # by paragraphs so no single chunk is overwhelming
        if wc > 350:
            paragraphs = [p.strip() for p in section["content"].split('\n\n') if p.strip()]
            
            # Group paragraphs into ~250 word windows with 50 word overlap
            window = []
            window_wc = 0
            sub_idx = 0
            
            for para in paragraphs:
                para_wc = word_count(para)
                
                if window_wc + para_wc > 300 and window:
                    # Flush current window as a chunk
                    chunk_text = '\n\n'.join(window)
                    chunks.append({
                        "id": f"{source_key}__{i}_{sub_idx}",
                        "source": source_key,
                        "heading": section["heading"],
                        "content": chunk_text,
                        "word_count": word_count(chunk_text),
                    })
                    sub_idx += 1
                    # Overlap: keep last paragraph in next window
                    window = [window[-1]] if window else []
                    window_wc = word_count(window[0]) if window else 0
                
                window.append(para)
                window_wc += para_wc
            
            # Don't forget the last window
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
            # Section is short enough — use it as-is
            chunks.append({
                "id": f"{source_key}__{i}_0",
                "source": source_key,
                "heading": section["heading"],
                "content": section["content"],
                "word_count": wc,
            })
    
    return chunks


def main():
    all_chunks = []
    
    for source_key, filepath in VAULT_FILES.items():
        chunks = chunk_file(source_key, filepath)
        all_chunks.extend(chunks)
        print(f"{source_key:30s} → {len(chunks):2d} chunks")
    
    print(f"\nTotal chunks: {len(all_chunks)}")
    print(f"Word count range: {min(c['word_count'] for c in all_chunks)} – {max(c['word_count'] for c in all_chunks)}")
    print(f"Average words per chunk: {sum(c['word_count'] for c in all_chunks) // len(all_chunks)}")
    
    # Save chunks to disk so we can inspect them before embedding
    os.makedirs(f"{PROJECT_PATH}/rag/data", exist_ok=True)
    with open(f"{PROJECT_PATH}/rag/data/chunks.json", "w") as f:
        json.dump(all_chunks, f, indent=2)
    
    print(f"\nSaved to {PROJECT_PATH}/rag/data/chunks.json")
    print("\nSample chunks:")
    for c in all_chunks[:3]:
        print(f"\n  [{c['id']}] ({c['word_count']} words)")
        print(f"  Heading: {c['heading']}")
        print(f"  Preview: {c['content'][:120].replace(chr(10), ' ')}...")


if __name__ == "__main__":
    main()
