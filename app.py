from flask import Flask, render_template, request, redirect, url_for, session, flash
import os
import io
import random
from pdf_parser import extract_text_from_pdf, parse_text_to_chapters

app = Flask(__name__)
app.secret_key = os.urandom(24)  # Needed for session management
app.config['UPLOAD_FOLDER'] = 'uploads' # Optional: if you want to save files persistently

# Ensure the upload folder exists if you plan to save files
if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

@app.route('/', methods=['GET'])
def index():
    """
    Redirects to the upload page.
    Alternatively, could show some welcome message or existing chapters if data is in session.
    """
    return redirect(url_for('upload_pdf'))

@app.route('/upload', methods=['GET', 'POST'])
def upload_pdf():
    if request.method == 'POST':
        if 'pdf_file' not in request.files:
            flash('No file part', 'error')
            return redirect(request.url)

        file = request.files['pdf_file']

        if file.filename == '':
            flash('No selected file', 'error')
            return redirect(request.url)

        if file and file.filename.endswith('.pdf'):
            try:
                # Read file into a BytesIO stream for the parser
                pdf_stream = io.BytesIO(file.read())

                raw_text = extract_text_from_pdf(pdf_stream)
                if raw_text is None:
                    flash('Could not extract text from PDF. The file might be corrupted or empty.', 'error')
                    return redirect(request.url)
                if not raw_text.strip():
                    flash('Extracted text from PDF is empty. The PDF might not contain selectable text.', 'info')
                    # We can still proceed to parse, parse_text_to_chapters should handle empty text.

                parsed_chapters = parse_text_to_chapters(raw_text)

                if not parsed_chapters:
                    flash('No chapters or words could be parsed from the PDF. Please check the PDF content and structure.', 'warning')
                    # Store empty list so chapters page can react accordingly
                    session['chapters_data'] = []
                else:
                    flash(f'Successfully parsed {len(parsed_chapters)} chapter(s).', 'success')
                    session['chapters_data'] = parsed_chapters

                return redirect(url_for('list_chapters'))

            except Exception as e:
                flash(f'An error occurred processing the PDF: {str(e)}', 'error')
                app.logger.error(f"Error processing PDF: {e}", exc_info=True) # Log the full error
                return redirect(request.url)
        else:
            flash('Invalid file type. Please upload a PDF file.', 'error')
            return redirect(request.url)

    return render_template('upload.html')

@app.route('/chapters')
def list_chapters():
    chapters_data = session.get('chapters_data', None)
    # If chapters_data is None, it means no PDF has been processed yet in this session.
    # If it's an empty list, a PDF was processed but no chapters were found.
    return render_template('chapters.html', chapters_data=chapters_data)

@app.route('/flashcards/<int:chapter_index>')
def view_flashcards(chapter_index):
    chapters_data = session.get('chapters_data', None)
    if not chapters_data or chapter_index >= len(chapters_data):
        flash('Chapter not found or PDF not processed yet.', 'error')
        return redirect(url_for('list_chapters'))

    chapter = chapters_data[chapter_index]
    if not chapter['words']:
        flash(f"Chapter '{chapter['name']}' has no words to study.", 'info')
        return redirect(url_for('list_chapters'))

    return render_template('flashcards.html', chapter_name=chapter['name'], words=chapter['words'], chapter_index=chapter_index)

def generate_quiz_questions(words_in_chapter, num_options=4):
    """
    Generates quiz questions for a chapter.
    Each question: { 'term': 'word', 'options': ['def1', 'def2', ...], 'answer': 'correct_def', 'id': 'q0' }
    """
    questions = []
    if not words_in_chapter or len(words_in_chapter) < 1: # Need at least 1 word for a question
        return questions

    all_definitions = [definition for _, definition in words_in_chapter]

    for i, (term, correct_definition) in enumerate(words_in_chapter):
        options = [correct_definition]

        # Get distractor definitions
        distractors = [d for d in all_definitions if d != correct_definition]

        # If not enough unique distractors, allow duplicates from the distractor pool
        # or if the distractor pool is small, take what's available.
        num_distractors_to_pick = num_options - 1

        if len(distractors) >= num_distractors_to_pick:
            options.extend(random.sample(distractors, num_distractors_to_pick))
        else:
            # Not enough unique distractors, take all available and pad if necessary
            options.extend(distractors)
            # If still not enough options, we might have very few unique words/definitions
            # This case is tricky. For now, we'll have fewer options if unavoidable.
            # Or, one could pad with generic incorrect answers, but that's out of scope for now.

        random.shuffle(options)
        questions.append({
            'id': f'q{i}',
            'term': term,
            'options': options,
            'answer': correct_definition # Store the correct answer text
        })
    return questions


@app.route('/quiz/<int:chapter_index>', methods=['GET'])
def take_quiz(chapter_index):
    chapters_data = session.get('chapters_data', None)
    if not chapters_data or chapter_index >= len(chapters_data):
        flash('Chapter not found or PDF not processed yet.', 'error')
        return redirect(url_for('list_chapters'))

    chapter = chapters_data[chapter_index]
    if not chapter['words']:
        flash(f"Chapter '{chapter['name']}' has no words for a quiz.", 'info')
        return redirect(url_for('list_chapters'))

    if len(chapter['words']) < 2 and len(chapter['words']) >0 : # Need at least 2 for distractors, but allow quiz for 1 word.
         flash(f"Chapter '{chapter['name']}' has very few words. Quiz options might be limited.", 'warning')
    elif not chapter['words']:
        flash(f"Chapter '{chapter['name']}' has no words for a quiz.", 'info')
        return redirect(url_for('list_chapters'))


    quiz_questions = generate_quiz_questions(chapter['words'])
    if not quiz_questions:
        flash(f"Could not generate quiz questions for chapter '{chapter['name']}'. Not enough unique words/definitions perhaps.", 'warning')
        return redirect(url_for('list_chapters'))

    session[f'quiz_questions_{chapter_index}'] = quiz_questions # Store questions for grading

    return render_template('quiz.html', chapter_name=chapter['name'], questions=quiz_questions, chapter_index=chapter_index)

@app.route('/submit_quiz/<int:chapter_index>', methods=['POST'])
def submit_quiz(chapter_index):
    original_questions = session.get(f'quiz_questions_{chapter_index}', None)
    chapters_data = session.get('chapters_data', None)

    if not original_questions or not chapters_data or chapter_index >= len(chapters_data):
        flash('Quiz data not found or session expired. Please try again.', 'error')
        return redirect(url_for('list_chapters'))

    chapter_name = chapters_data[chapter_index]['name']
    user_answers = request.form
    score = 0
    results = [] # To store {'question': term, 'your_answer': ..., 'correct_answer': ..., 'is_correct': ...}

    for question in original_questions:
        question_id = question['id']
        user_answer = user_answers.get(question_id)
        correct_answer = question['answer']
        is_correct = user_answer == correct_answer
        if is_correct:
            score += 1

        results.append({
            'term': question['term'],
            'options': question['options'],
            'your_answer': user_answer if user_answer is not None else "답변 없음",
            'correct_answer': correct_answer,
            'is_correct': is_correct
        })

    num_questions = len(original_questions)
    percentage_score = (score / num_questions) * 100 if num_questions > 0 else 0

    return render_template('quiz_results.html',
                           chapter_name=chapter_name,
                           score=score,
                           num_questions=num_questions,
                           percentage_score=percentage_score,
                           results=results,
                           chapter_index=chapter_index)

if __name__ == '__main__':
    app.run(debug=True)
