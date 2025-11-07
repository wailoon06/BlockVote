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

def verify_ic():
    """Verify IC number from front and back images using OCR"""
    if 'front' not in request.files or 'back' not in request.files:
        return jsonify({"error": "Please upload both 'front' and 'back' images"}), 400

    # Save uploaded files
    front_file = request.files['front']
    back_file = request.files['back']

    try:
        # Extract text from both sides
        front_text = extract_text(front_file)
        back_text = extract_text(back_file)

        # Extract IC numbers from both sides
        front_ic = extract_ic_number(front_text)
        back_ic = extract_ic_number(back_text)
                
        # Check if IC number was found
        if not front_ic:
            return jsonify({"IC": None, "valid": False, "message": "IC number not found on front side"})
        
        if not back_ic:
            return jsonify({"IC": None, "valid": False, "message": "IC number not found on back side"})
            
        # Use the IC number that was found (prefer front, fallback to back)
        ic_number = front_ic if front_ic else back_ic
        
        # If both found, verify they match
        if front_ic and back_ic and front_ic != back_ic:
            return jsonify({
                "IC": None, 
                "valid": False, 
                "message": f"IC numbers don't match (Front: {front_ic}, Back: {back_ic})"
            })
        
        # Validate the IC number
        valid = validate_ic(ic_number)
        
        return jsonify({
            "IC": ic_number, 
            "valid": valid,
            "message": "IC verified successfully" if valid else "Invalid IC number"
        })
    except Exception as e:
        
        return jsonify({"error": f"IC verification failed: {str(e)}"}), 500
        
def match_faces():
    """Compare faces from IC and selfie using DeepFace"""
    if 'front' not in request.files or 'selfie_image' not in request.files:
        return jsonify({'error': 'No images provided'}), 400

    ic = request.files['front']
    selfie = request.files['selfie_image']

    try:
        # Use DeepFace to verify faces
        result = DeepFace.verify(
            img1_path=ic, 
            img2_path=selfie, 
            model_name="Facenet512",
            enforce_detection=True
        )
        
        return jsonify({
            'match': result["verified"],
            'distance': result["distance"],
            'threshold': result["threshold"],
            'confidence': 1 - (result["distance"] / result["threshold"]) if result["verified"] else 0
        })
    except Exception as e:
        
        error_msg = str(e)
        if 'Face could not be detected' in error_msg:
            return jsonify({'error': 'No face found in one of the images'}), 400
        else:
            return jsonify({'error': f'Face matching failed: {error_msg}'}), 500

@app.route('/verify', methods=['POST'])
def verify():
    """Combined endpoint: Verify IC and match faces in one request"""
    if 'front' not in request.files or 'back' not in request.files or 'selfie_image' not in request.files:
        return jsonify({"error": "Please upload front, back, and selfie_image files"}), 400

    front_file = request.files['front']
    back_file = request.files['back']
    selfie_file = request.files['selfie_image']

    # Generate unique filenames
    import time
    timestamp = str(int(time.time() * 1000))
    
    UPLOAD_FOLDER = 'uploads'
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    
    front_path = os.path.join(UPLOAD_FOLDER, f"front_{timestamp}.jpg")
    selfie_path = os.path.join(UPLOAD_FOLDER, f"selfie_{timestamp}.jpg")

    try:
        # Step 1: Verify IC from front and back
        front_text = extract_text(front_file)
        
        # Reset file pointer for back file
        back_file.seek(0)
        back_text = extract_text(back_file)

        # Extract IC numbers from both sides
        front_ic = extract_ic_number(front_text)
        back_ic = extract_ic_number(back_text)
        
        # Check if IC number was found
        if not front_ic and not back_ic:
            return jsonify({
                "ic_verified": False,
                "face_matched": False,
                "message": "IC number not found on either side"
            }), 400

        # Use the IC number that was found (prefer front, fallback to back)
        ic_number = front_ic if front_ic else back_ic
        
        # If both found, verify they match
        if front_ic and back_ic and front_ic != back_ic:
            return jsonify({
                "ic_verified": False,
                "face_matched": False,
                "message": f"IC numbers don't match (Front: {front_ic}, Back: {back_ic})"
            }), 400

        # Validate the IC number
        ic_valid = validate_ic(ic_number)
        
        if not ic_valid:
            return jsonify({
                "ic_verified": False,
                "face_matched": False,
                "message": "Invalid IC number"
            }), 400

        # Step 2: Match faces between IC front and selfie
        # Save front and selfie images for DeepFace
        front_file.seek(0)  # Reset file pointer
        front_file.save(front_path)
        selfie_file.save(selfie_path)
        
        # Verify files were saved correctly
        if not os.path.exists(front_path) or os.path.getsize(front_path) == 0:
            raise Exception("Front image file was not saved correctly")
        if not os.path.exists(selfie_path) or os.path.getsize(selfie_path) == 0:
            raise Exception("Selfie image file was not saved correctly")

        # Use DeepFace to verify faces
        face_result = DeepFace.verify(
            img1_path=front_path, 
            img2_path=selfie_path, 
            model_name="Facenet512",
            enforce_detection=True
        )
        
        # Clean up temporary files
        try:
            os.remove(front_path)
            os.remove(selfie_path)
        except:
            pass

        # Return combined result
        return jsonify({
            'ic_verified': True,
            'face_matched': face_result["verified"],
            'ic_number': ic_number,
            'face_confidence': 1 - (face_result["distance"] / face_result["threshold"]) if face_result["verified"] else 0,
            'message': 'Verification complete' if face_result["verified"] else 'Face verification failed'
        })

    except Exception as e:
        # Clean up files on error
        try:
            os.remove(front_path)
            os.remove(selfie_path)
        except:
            pass
        
        error_msg = str(e)
        if 'Face could not be detected' in error_msg:
            return jsonify({
                "ic_verified": True,
                "face_matched": False,
                "message": "No face detected in one of the images"
            }), 400
        else:
            return jsonify({
                "ic_verified": False,
                "face_matched": False,
                "message": f"Verification failed: {error_msg}"
            }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True) 