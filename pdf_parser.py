import PyPDF2
import io
import re

def extract_text_from_pdf(pdf_file_stream):
    """
    Extracts raw text from a PDF file stream.
    """
    try:
        pdf_file_stream.seek(0) # Ensure stream is at the beginning
        reader = PyPDF2.PdfReader(pdf_file_stream)
        text = ""
        for page_num in range(len(reader.pages)):
            page = reader.pages[page_num]
            text += page.extract_text() or "" # Add empty string if None
        return text
    except Exception as e:
        print(f"Error extracting text from PDF: {e}")
        return None

def parse_text_to_chapters(raw_text):
    """
    Parses raw text into a list of chapters, with each chapter containing words.
    This is a very basic initial implementation and will likely need
    significant refinement based on the actual PDF structure.

    Expected format:
    [
        {"name": "Chapter 1 Name", "words": [("word1", "def1"), ("word2", "def2")]},
        {"name": "Chapter 2 Name", "words": [("word_a", "def_a")]},
    ]
    """
    if not raw_text:
        return []

    chapters = []
    current_chapter_name = "Default Chapter"
    current_words = []

    # Split by lines and process
    lines = raw_text.splitlines()

    # Regex to identify potential chapter titles (Korean or English)
    # Allows more flexible chapter identifiers like "A-1", "1. Introduction"
    # Group 1: Chapter identifier (e.g., "1", "A-1", "One", "1 - Topic") - greedy
    # Group 2: Chapter name (e.g., "Introduction", "The Basics") - gets what's after separator
    # Separator part is non-greedy: `[:–\s]*?` (colon, en-dash, or space, optional, non-greedy)
    chapter_title_pattern = re.compile(r"^(?:Chapter|단원)\s*([\w\d.\-\s()\[\]']+)[:–\s]*?(.*)", re.IGNORECASE)

    # Regex to identify word-definition pairs
    # Allows parentheses, brackets, quotes, commas, periods in terms and definitions.
    # Term part is non-greedy. Definition part is greedy.
    word_def_pattern = re.compile(r"^([\w\s\uAC00-\uD7A3()\[\]'\".,]+?)\s*(?:[:\-–]|(?<=\S)\t)\s*([\w\s\uAC00-\uD7A3()\[\]'\".,;!?]+)", re.UNICODE)


    for line in lines:
        line = line.strip()
        if not line:
            continue

        chapter_match = chapter_title_pattern.match(line)
        if chapter_match:
            # If we were in a chapter and found a new one, save the previous one
            if current_words or current_chapter_name != "Default Chapter":
                 # If current_words is empty but name is not default, it implies a chapter title was found
                 # but no words followed before the next chapter title. Still, save it as an empty chapter.
                if not chapters and current_chapter_name == "Default Chapter" and not current_words:
                    # This is the first "chapter" before any explicit title, let's see if we should add it
                    if current_words: # Only add if there were words before the first explicit chapter
                         chapters.append({"name": current_chapter_name, "words": current_words})
                elif current_chapter_name != "Default Chapter" or current_words:
                     chapters.append({"name": current_chapter_name, "words": current_words})


            # Start a new chapter
            g1 = chapter_match.group(1).strip() # Full potential title or ID part
            g2 = chapter_match.group(2).strip() # Name part, if separator was explicitly matched by [:–] in the pattern

            if g2 : # Separator was present and g2 captured the name
                # g1 is the ID/prefix. Clean it of trailing separators if any.
                if g1.endswith(':') or g1.endswith('–') or g1.endswith('-'):
                    g1 = g1[:-1].strip()
                current_chapter_name = f"{g1}: {g2}" if g1 else g2 # Prefers "ID: Name"
            elif g1: # No explicit separator matched by [:–] in pattern, g1 has the whole title string
                current_chapter_name = g1
                # Clean possible trailing separator from g1 itself if it's the whole title and ends with one
                # e.g. "Chapter Title:" or "Chapter Title -"
                if current_chapter_name.endswith(':') or current_chapter_name.endswith('–') or current_chapter_name.endswith('-'):
                    current_chapter_name = current_chapter_name[:-1].strip()
            else: # Both g1 and g2 are empty (should not happen if pattern matches "Chapter" or "단원")
                current_chapter_name = f"Unnamed Chapter {len(chapters) + 1}"

            if not current_chapter_name: # Final fallback if logic resulted in empty string
                 current_chapter_name = f"Unnamed Chapter {len(chapters) + 1}"

            current_words = []
        else:
            word_def_match = word_def_pattern.match(line)
            if word_def_match:
                word = word_def_match.group(1).strip()
                definition = word_def_match.group(2).strip()
                if word and definition: # Ensure both word and definition are non-empty
                    current_words.append((word, definition))
            # else:
                # This line is not a chapter title and not a recognized word-definition pair.
                # Depending on PDF structure, we might want to accumulate it or log it.
                # For now, we ignore it.
                # print(f"Ignoring line: {line}")


    # Add the last processed chapter, but only if it has a non-default name or words
    if current_chapter_name != "Default Chapter" or current_words:
        chapters.append({"name": current_chapter_name, "words": current_words})

    # If only a "Default Chapter" with no words was created and there are other chapters, remove it.
    # Or if no chapters were found at all, and the default chapter is empty, return empty list.
    if not chapters and current_chapter_name == "Default Chapter" and not current_words:
        return []
    if len(chapters) > 1 and chapters[0]["name"] == "Default Chapter" and not chapters[0]["words"]:
        chapters.pop(0)
    elif len(chapters) == 1 and chapters[0]["name"] == "Default Chapter" and not chapters[0]["words"]: # Only default chapter and it's empty
        return []


    return chapters

if __name__ == '__main__':
    # Basic test with a simulated text structure
    # This part is for direct testing of the parser if you run `python pdf_parser.py`
    # In the web app, extract_text_from_pdf will be used with a file stream.

    print("Testing with simulated text data:")

    # Test Case 1: Simple English Chapters
    test_text_1 = """
Chapter 1: The Beginning
Apple : A fruit
Banana : Another fruit

Chapter 2: More Things
Car : A vehicle
House : A building
    """
    print("\n--- Test Case 1: Simple English ---")
    parsed_chapters_1 = parse_text_to_chapters(test_text_1)
    if parsed_chapters_1:
        for i, chapter in enumerate(parsed_chapters_1):
            print(f"Chapter {i+1}: {chapter['name']}")
            for word, definition in chapter['words']:
                print(f"  - {word}: {definition}")
    else:
        print("No chapters parsed.")

    # Test Case 2: Simple Korean Chapters
    test_text_2 = """
단원 1: 과일
사과 : 맛있는 과일
바나나 : 노란 과일

단원 2: 탈것
자동차 : 네 바퀴
비행기 : 하늘을 나는 것
    """
    print("\n--- Test Case 2: Simple Korean ---")
    parsed_chapters_2 = parse_text_to_chapters(test_text_2)
    if parsed_chapters_2:
        for i, chapter in enumerate(parsed_chapters_2):
            print(f"Chapter {i+1}: {chapter['name']}")
            for word, definition in chapter['words']:
                print(f"  - {word}: {definition}")
    else:
        print("No chapters parsed.")

    # Test Case 3: Mixed, different separators, and no chapter title for first entries
    test_text_3 = """
Book - A collection of pages
Pen - An instrument for writing

단원 10 - 학습 도구
연필 : 글씨 쓰는 도구
지우개 : 지우는 도구

Chapter 3 Part 2
Table : Furniture
Chair : Also furniture
    """
    print("\n--- Test Case 3: Mixed, no initial chapter title, different separators ---")
    parsed_chapters_3 = parse_text_to_chapters(test_text_3)
    if parsed_chapters_3:
        for i, chapter in enumerate(parsed_chapters_3):
            print(f"Chapter {i+1}: {chapter['name']}")
            for word, definition in chapter['words']:
                print(f"  - {word}: {definition}")
    else:
        print("No chapters parsed.")

    # Test Case 4: No explicit chapter titles
    test_text_4 = """
하나 : 숫자 일
둘 : 숫자 이
셋 : 숫자 삼
    """
    print("\n--- Test Case 4: No explicit chapter titles ---")
    parsed_chapters_4 = parse_text_to_chapters(test_text_4)
    if parsed_chapters_4:
        for i, chapter in enumerate(parsed_chapters_4):
            print(f"Chapter {i+1}: {chapter['name']}")
            for word, definition in chapter['words']:
                print(f"  - {word}: {definition}")
    else:
        print("No chapters parsed.")

    # Test Case 5: Empty text
    test_text_5 = ""
    print("\n--- Test Case 5: Empty text ---")
    parsed_chapters_5 = parse_text_to_chapters(test_text_5)
    if parsed_chapters_5:
        for i, chapter in enumerate(parsed_chapters_5):
            print(f"Chapter {i+1}: {chapter['name']}")
            for word, definition in chapter['words']:
                print(f"  - {word}: {definition}")
    else:
        print("No chapters parsed (expected).")

    # Test Case 6: Only chapter titles, no words
    test_text_6 = """
Chapter 1: Title Only

Chapter 2
    """
    print("\n--- Test Case 6: Only chapter titles, no words ---")
    parsed_chapters_6 = parse_text_to_chapters(test_text_6)
    if parsed_chapters_6:
        for i, chapter in enumerate(parsed_chapters_6):
            print(f"Chapter {i+1}: {chapter['name']}")
            for word, definition in chapter['words']:
                print(f"  - {word}: {definition}")
    else:
        print("No chapters parsed.")

    # Test Case 7: Chapter title with no specific name part
    test_text_7 = """
단원 1
물 : 마시는 것
불 : 뜨거운 것
Chapter 2
공기 : 숨쉬는 것
흙 : 땅
    """
    print("\n--- Test Case 7: Chapter titles without specific names ---")
    parsed_chapters_7 = parse_text_to_chapters(test_text_7)
    if parsed_chapters_7:
        for i, chapter in enumerate(parsed_chapters_7):
            print(f"Chapter {i+1}: {chapter['name']}") # Should be "단원 1", "Chapter 2"
            for word, definition in chapter['words']:
                print(f"  - {word}: {definition}")
    else:
        print("No chapters parsed.")

    # Test Case 8: PDF-like text with more complex word/definition lines
    test_text_8 = """
단원 1: 동물 (Animals)
개 (Dog) : 충성스러운 친구. (A loyal friend.)
고양이 (Cat) - 독립적인 반려동물. (An independent pet.)
새 (Bird)    하늘을 나는 동물 (A flying animal)
"""
    print("\n--- Test Case 8: More complex word/definition lines ---")
    parsed_chapters_8 = parse_text_to_chapters(test_text_8)
    if parsed_chapters_8:
        for i, chapter in enumerate(parsed_chapters_8):
            print(f"Chapter {i+1}: {chapter['name']}")
            for word, definition in chapter['words']:
                print(f"  - {word}: {definition}")
    else:
        print("No chapters parsed.")

    # Test case for words before any chapter title
    test_text_9 = """
First Word : Its Definition
Second Word : Another Definition

Chapter 1: Numbers
One : 1
Two : 2
    """
    print("\n--- Test Case 9: Words before any chapter title ---")
    parsed_chapters_9 = parse_text_to_chapters(test_text_9)
    if parsed_chapters_9:
        for i, chapter in enumerate(parsed_chapters_9):
            print(f"Chapter {i+1}: {chapter['name']}")
            for word, definition in chapter['words']:
                print(f"  - {word}: {definition}")
    else:
        print("No chapters parsed.")

    # Test case for only chapter title, no words, then another chapter with words
    test_text_10 = """
Chapter 1: Empty Section

Chapter 2: Useful Words
Help : Assistance
Work : Effort
    """
    print("\n--- Test Case 10: Empty chapter followed by chapter with words ---")
    parsed_chapters_10 = parse_text_to_chapters(test_text_10)
    if parsed_chapters_10:
        for i, chapter in enumerate(parsed_chapters_10):
            print(f"Chapter {i+1}: {chapter['name']}")
            for word, definition in chapter['words']:
                print(f"  - {word}: {definition}")
    else:
        print("No chapters parsed.")

    # Test case for a PDF that might start with non-chapter, non-word content
    test_text_11 = """
Introduction
This document contains a list of words.

단원 1: 필수 어휘
시작 : 처음
과정 : 중간
끝 : 마지막
    """
    print("\n--- Test Case 11: Intro text before first chapter ---")
    parsed_chapters_11 = parse_text_to_chapters(test_text_11)
    if parsed_chapters_11:
        for i, chapter in enumerate(parsed_chapters_11):
            print(f"Chapter {i+1}: {chapter['name']}")
            for word, definition in chapter['words']:
                print(f"  - {word}: {definition}")
    else:
        print("No chapters parsed.")

    # Test case for tab-separated values
    test_text_12 = """
단원 100
단어1\t정의1
단어2\t정의2
단어3\t정의3
    """
    print("\n--- Test Case 12: Tab-separated words and definitions ---")
    parsed_chapters_12 = parse_text_to_chapters(test_text_12)
    if parsed_chapters_12:
        for i, chapter in enumerate(parsed_chapters_12):
            print(f"Chapter {i+1}: {chapter['name']}")
            for word, definition in chapter['words']:
                print(f"  - {word}: {definition}")
    else:
        print("No chapters parsed.")

    # Test case for words with numbers and mixed scripts
    test_text_13 = """
Chapter A-1: Mixed Terms
Term 1 (용어 1) : Definition Alpha
Term 2 (용어 2) : Definition Beta. This is a test.
    """
    print("\n--- Test Case 13: Words with numbers and mixed scripts ---")
    parsed_chapters_13 = parse_text_to_chapters(test_text_13)
    if parsed_chapters_13:
        for i, chapter in enumerate(parsed_chapters_13):
            print(f"Chapter {i+1}: {chapter['name']}")
            for word, definition in chapter['words']:
                print(f"  - {word}: {definition}")
    else:
        print("No chapters parsed.")

    # Test case: No words, just a chapter title
    test_text_14 = "Chapter 1: My Title"
    print("\n--- Test Case 14: Only a chapter title ---")
    parsed_chapters_14 = parse_text_to_chapters(test_text_14)
    if parsed_chapters_14:
        for i, chapter in enumerate(parsed_chapters_14):
            print(f"Chapter {i+1}: {chapter['name']}")
            for word, definition in chapter['words']:
                print(f"  - {word}: {definition}")
    else:
        print("No chapters parsed.")

    # Test case: Only words, no chapter title
    test_text_15 = "Word1 : Def1\nWord2 : Def2"
    print("\n--- Test Case 15: Only words, no chapter title ---")
    parsed_chapters_15 = parse_text_to_chapters(test_text_15)
    if parsed_chapters_15:
        for i, chapter in enumerate(parsed_chapters_15):
            print(f"Chapter {i+1}: {chapter['name']}")
            for word, definition in chapter['words']:
                print(f"  - {word}: {definition}")
    else:
        print("No chapters parsed.")

    # Test case: Chapter title, then words, then another chapter title without words
    test_text_16 = """
Chapter 1: Words
A : B
C : D
Chapter 2: No Words Here
    """
    print("\n--- Test Case 16: Chapter with words, then chapter without words ---")
    parsed_chapters_16 = parse_text_to_chapters(test_text_16)
    if parsed_chapters_16:
        for i, chapter in enumerate(parsed_chapters_16):
            print(f"Chapter {i+1}: {chapter['name']}")
            for word, definition in chapter['words']:
                print(f"  - {word}: {definition}")
    else:
        print("No chapters parsed.")

    # Test case: Chapter title, then words, then another chapter title without words, then a chapter with words
    test_text_17 = """
Chapter 1: Words
A : B
C : D
Chapter 2: No Words Here
Chapter 3: More Words
E : F
    """
    print("\n--- Test Case 17: Complex sequence of chapters with/without words ---")
    parsed_chapters_17 = parse_text_to_chapters(test_text_17)
    if parsed_chapters_17:
        for i, chapter in enumerate(parsed_chapters_17):
            print(f"Chapter {i+1}: {chapter['name']}")
            for word, definition in chapter['words']:
                print(f"  - {word}: {definition}")
    else:
        print("No chapters parsed.")

    # Test with a PDF file (requires a sample.pdf)
    # Create a dummy PDF for testing if PyPDF2 is installed
    try:
        from PyPDF2 import PdfWriter
        # Create a dummy PDF in memory
        writer = PdfWriter()
        writer.add_blank_page(width=8.5 * 72, height=11 * 72) # Standard US Letter size in points
        # To add text, we'd typically use a library that can "draw" on the PDF page,
        # PyPDF2 is more for reading and manipulating existing PDFs.
        # For a simple text extraction test, we can use a real PDF or a more complex setup.
        # For now, we'll just simulate the text extraction part.

        # Let's try to create a PDF with some text if reportlab is available or use a pre-existing one.
        # This is complex to do robustly here.
        # Instead, we'll assume `extract_text_from_pdf` works and focus on `parse_text_to_chapters`.

        print("\n--- PDF File Test (Conceptual - requires a 'sample.pdf') ---")
        # Simulate having a PDF file stream
        # In a real scenario, this would come from an uploaded file
        try:
            with open("sample.pdf", "rb") as f: # You'll need to create a sample.pdf for this to run
                sample_pdf_stream = io.BytesIO(f.read())
                extracted_pdf_text = extract_text_from_pdf(sample_pdf_stream)
                if extracted_pdf_text:
                    print("Successfully extracted text from sample.pdf (first 200 chars):")
                    print(extracted_pdf_text[:200] + "...")
                    parsed_pdf_data = parse_text_to_chapters(extracted_pdf_text)
                    if parsed_pdf_data:
                        print("\nParsed data from sample.pdf:")
                        for i, chapter in enumerate(parsed_pdf_data):
                            print(f"Chapter {i+1}: {chapter['name']}")
                            #for word, definition in chapter['words']:
                                #print(f"  - {word}: {definition}")
                            print(f"  - Word count: {len(chapter['words'])}")
                    else:
                        print("Could not parse chapters from the sample.pdf text.")
                else:
                    print("Could not extract text from sample.pdf, or it was empty.")
        except FileNotFoundError:
            print("sample.pdf not found. Skipping PDF file test.")
        except Exception as e:
            print(f"Error during PDF file test: {e}")

    except ImportError:
        print("PyPDF2 not installed, skipping PDF creation for test.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

    print("\n--- Test with content from sample_data.txt ---")
    sample_text_content = """
단원 1: 기초 동물
개 : 네 발 달린 친구
고양이 : 독립적인 반려동물
새 : 날개 달린 동물
물고기 : 물 속에서 사는 동물

단원 2: 과일과 채소
사과 : 빨갛고 달콤한 과일
바나나 : 길고 노란 과일
당근 : 주황색 뿌리 채소
오이 : 초록색 길쭉한 채소
"""
    parsed_sample_data = parse_text_to_chapters(sample_text_content)
    if parsed_sample_data:
        for i, chapter in enumerate(parsed_sample_data):
            print(f"Chapter {i+1}: {chapter['name']}")
            for word, definition in chapter['words']:
                print(f"  - {word}: {definition}")
            print(f"  Word count: {len(chapter['words'])}")

    else:
        print("No chapters parsed from sample_data.txt content.")


    print("\nPDF Parser module created with basic functions and test cases.")
    print("NOTE: The `parse_text_to_chapters` function is highly dependent on PDF text structure and will need real PDF examples to be made robust.")

# To make this runnable and testable:
# 1. Save this as pdf_parser.py
# 2. You might need to install PyPDF2: pip install PyPDF2
# 3. Run: python pdf_parser.py
# 4. For the PDF file test part in __main__, you'd need a 'sample.pdf' in the same directory.
#
#    And save it as sample.pdf. The success of extraction will depend on how the PDF creator stored the text.

# The extract_text_from_pdf now returns None on error and prints a message.
# The parse_text_to_chapters has improved regex and logic for handling various cases.
# Added more comprehensive test cases within the __main__ block.
# The word_def_pattern now tries to be more inclusive of characters and handles different separators.
# The chapter_title_pattern also improved.
# Logic for handling chapters (especially the first "Default Chapter" and empty chapters) has been refined.

# Final check on logic for adding chapters:
# - A chapter is added when a new chapter title is found OR when the end of the text is reached.
# - The "Default Chapter" is only added if it actually contains words, or if it's the *only* chapter.
# - Empty chapters (a title was found, but no words followed before the next title or EOF) are now added.
#   This might be desired if the PDF truly has empty chapters. If not, this could be filtered later.
# - Word/definition pairs require both parts to be non-empty after stripping.
# - Added a check for empty raw_text at the beginning of parse_text_to_chapters.
# - Ensured file stream is reset with seek(0) in extract_text_from_pdf.
# - Added re.UNICODE to word_def_pattern for better handling of Korean characters in some regex engines, though standard Python re handles unicode well.
# - Refined the logic for when to add the `current_chapter` to `chapters` to avoid duplicates or incorrect handling of the first/last chapters.
# - Made sure that if `chapter_match.group(1)` is empty (e.g. "Chapter 1: "), it still forms a valid chapter name like "Chapter 1".
# - Word/definition regex `([\w\s\uAC00-\uD7A3]+?)` is non-greedy for the word part, and `([\w\s\uAC00-\uD7A3.]+)` is greedy for definition.
#   Added period `.` to allowed characters in definition.
# - Separator `(?<=\S)\t` for tab ensures it's not a leading tab on an empty line.
# - Improved handling of the very first "Default Chapter" if words appear before any explicit chapter title.
# - Improved handling of empty chapters and the final state of the chapters list.
