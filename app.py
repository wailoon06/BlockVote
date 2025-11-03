from flask import Flask, request, jsonify
from PIL import Image
import pytesseract
import face_recognition
import re
from datetime import datetime
import os
from werkzeug.utils import secure_filename

app = Flask(__name__)

@app.route('/match_faces', methods=['POST'])
def match_faces():
    if 'ic_image' not in request.files or 'selfie_image' not in request.files:
        return jsonify({'error': 'No images provided'}), 400
    
    ic_image_file = request.files['ic_image']
    selfie_image_file = request.files['selfie_image']

    # Load images
    ic_image = face_recognition.load_image_file(ic_image_file)
    selfie_image = face_recognition.load_image_file(selfie_image_file)

    # Encode faces
    ic_face_encoding = face_recognition.face_encodings(ic_image)
    selfie_face_encoding = face_recognition.face_encodings(selfie_image)

    if len(ic_face_encoding) == 0 or len(selfie_face_encoding) == 0:
        return jsonify({'error': 'No face found in one of the images'}), 400

    # Compare faces
    results = face_recognition.compare_faces([ic_face_encoding[0]], selfie_face_encoding[0], tolerance=0.5)

    #return jsonify({'match': bool(results[0])})
    return jsonify({'match': results[0]})


UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Regex pattern for Malaysian IC: YYMMDD-PP-XXXX
IC_PATTERN = r"\b(\d{6}-\d{2}-\d{4})\b"

def extract_text(image_path):
    """Extract text from an image using pytesseract."""
    text = pytesseract.image_to_string(Image.open(image_path))
    return text

def validate_ic(ic_number):
    """Validate Malaysian IC number."""
    try:
        date_part = ic_number[:6]
        birth_date = datetime.strptime(date_part, "%y%m%d")
        # Check plausible date range
        if birth_date.year < 1900 or birth_date.year > datetime.now().year:
            return False
        return True
    except ValueError:
        return False

@app.route('/verify_ic', methods=['POST'])
def verify_ic():
    if 'front' not in request.files or 'back' not in request.files:
        return jsonify({"error": "Please upload both 'front' and 'back' images"}), 400

    # Save uploaded files
    front_file = request.files['front']
    back_file = request.files['back']

    front_path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(front_file.filename))
    back_path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(back_file.filename))
    front_file.save(front_path)
    back_file.save(back_path)

    # Extract text from both sides
    front_text = extract_text(front_path)
    back_text = extract_text(back_path)
    full_text = front_text + " " + back_text

    # Find IC number
    match = re.search(IC_PATTERN, full_text)
    if not match:
        return jsonify({"IC": None, "valid": False, "message": "IC number not found"})

    ic_number = match.group(1)
    valid = validate_ic(ic_number)
    return jsonify({"IC": ic_number, "valid": valid})

if __name__ == '__main__':
    app.run(debug=True) 