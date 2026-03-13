"""
STAGE 1C: Query (using package imports)
=======================================

Example usage of the portfolio_vault RAG package.
"""

import sys
from pathlib import Path

# Add parent directory to path so portfolio_vault can be imported
sys.path.insert(0, str(Path(__file__).parent.parent))

from portfolio_vault import retrieve_and_answer, print_config

if __name__ == "__main__":
    print_config()
    
    test_queries = [
        "Which of Daud's projects involved payment processing?",
        "What IoT or hardware work has Daud done?",
        "How many users has Daud's work reached?",
        "What is Daud's strongest technical skill?",
    ]
    
    for question in test_queries:
        print(f"\nQuestion: {question}")
        print("-" * 50)
        
        answer, chunks = retrieve_and_answer(question, n_results=5)
        
        print(f"Retrieved {len(chunks)} chunks:")
        for c in chunks:
            icon = "G" if c['similarity'] > 0.7 else "Y" if c['similarity'] > 0.4 else "R"
            print(f"  [{icon}] sim={c['similarity']}  {c['source']} / {c['heading']}")
        
        print(f"\nAnswer:")
        print(answer)
        print()
