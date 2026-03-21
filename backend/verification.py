from flask import Flask, request, jsonify
from flask_cors import CORS

import re
import os
from datetime import datetime
import numpy as np

import easyocr
import cv2

from deepface import DeepFace

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Initialize EasyOCR reader globally (English and Malay)
reader = easyocr.Reader(['en', 'ms'], gpu=False)

# Regex pattern for Malaysian IC: YYMMDD-PP-XXXX
IC_PATTERN = r"\b(\d{6}-\d{2}-\d{4})\b"

# Pattern for back IC with extra digits: YYMMDD-PP-XXXX-XX-XX
IC_BACK_PATTERN = r"\b(\d{6}-\d{2}-\d{4})-\d{2}-\d{2}\b"

def extract_text(uploaded_file):
    file_bytes = np.frombuffer(uploaded_file.read(), np.uint8)
    img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("Image could not be processed")

    result = reader.readtext(img, detail=0)
    return "\n".join(result)

def extract_ic_number(text):
    """Extract IC number from text, handling both front and back formats."""
    back_match = re.search(IC_BACK_PATTERN, text)
    if back_match:
        return back_match.group(1)
    
    front_match = re.search(IC_PATTERN, text)
    if front_match:
        return front_match.group(1)
    
    return None

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

@app.route("/")
def home():
    return "API is running"

@app.route('/verify', methods=['POST'])
def verify():
    if 'front' not in request.files or 'back' not in request.files or 'selfie_image' not in request.files:
        return jsonify({
            "error": "Please upload all required files!",
            "feedback": "Missing required files. Please upload IC front, IC back, and selfie images."
        }), 400
    
    # Save uploaded files
    front_file = request.files['front']
    back_file = request.files['back']
    selfie = request.files['selfie_image']

    # Extract text from both sides
    front_text = extract_text(front_file)
    back_text = extract_text(back_file)

     # Extract IC numbers from both sides
    front_ic = extract_ic_number(front_text)
    back_ic = extract_ic_number(back_text)
                
     # Check if IC number was found
    if not front_ic:
        return jsonify({
            "IC": None, 
            "valid": False, 
            "message": "IC number not found on front side",
            "feedback": "Unable to detect IC number from the front image. Please ensure the image is clear and the IC number is visible."
        })
        
    if not back_ic:
        return jsonify({
            "IC": None, 
            "valid": False, 
            "message": "IC number not found on back side",
            "feedback": "Unable to detect IC number from the back image. Please ensure the image is clear and the IC number is visible."
        })
            
    # Use the IC number that was found (prefer front, fallback to back)
    ic_number = front_ic if front_ic else back_ic

    # If both found, verify they match
    if front_ic and back_ic and front_ic != back_ic:
        return jsonify({
            "message": f"IC numbers don't match (Front: {front_ic}, Back: {back_ic})",
            "feedback": "The IC numbers detected from front and back images do not match. Please ensure both images are from the same IC card."
        })
        
    # Validate the IC number
    valid = validate_ic(ic_number)
    if not valid:
        return jsonify({
            "error": f"IC verification failed",
            "feedback": f"IC number '{ic_number}' has an invalid format or date. Please verify the IC card images."
        })
    
    try:
        # Use DeepFace to verify faces
        result = DeepFace.verify(
            img1_path=front_file, 
            img2_path=selfie, 
            model_name="Facenet512",
            enforce_detection=True
        )
        
        return jsonify({
            'ic_verified': True,
            'face_matched': 'verified',
            'ic_number': ic_number,
            'message': 'Verification complete',
            'feedback': 'Identity verification successful! IC number validated and face matched.'
        })
    except Exception as e:

        error_msg = str(e)
        if 'Face could not be detected' in error_msg:
            return jsonify({
                'error': 'No face found in one of the images',
                'feedback': 'Unable to detect a face in the IC or selfie image. Please ensure both images clearly show a face.'
            }), 400
        else:
            return jsonify({
                'error': f'Face matching failed: {error_msg}',
                'feedback': 'Face verification failed. The face in the selfie does not match the IC photo or an error occurred during processing.'
            }), 500
    
if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=5000, debug=True) 

        




