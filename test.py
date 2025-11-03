from flask import Flask, request, jsonify
from deepface import DeepFace
import os

app = Flask(__name__)

@app.route('/match_faces', methods=['POST'])
def match_faces():
    if 'ic_image' not in request.files or 'selfie_image' not in request.files:
        return jsonify({'error': 'No images provided'}), 400

    ic_image_file = request.files['ic_image']
    selfie_image_file = request.files['selfie_image']

    # Save temporary files
    ic_path = "temp_ic.jpg"
    selfie_path = "temp_selfie.jpg"
    ic_image_file.save(ic_path)
    selfie_image_file.save(selfie_path)

    try:
        # Run DeepFace verification
        result = DeepFace.verify(
            img1_path=ic_path,
            img2_path=selfie_path,
            model_name="VGG-Face",        # other options: Facenet, ArcFace, Dlib
            detector_backend="retinaface", # better for partial faces
            enforce_detection=False         # important if IC face is not full
        )

        # Clean up temporary files
        os.remove(ic_path)
        os.remove(selfie_path)

        # Respond with result
        return jsonify({
            'match': bool(result['verified']),
            'distance': result['distance'],
            'threshold': result['threshold'],
            'model': result['model'],
            'detector': result['detector_backend']
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    import warnings
    warnings.filterwarnings("ignore")
    os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
    app.run(debug=True)
