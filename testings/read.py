import easyocr
import sys

# Initialize EasyOCR reader globally (English and Malay)
reader = easyocr.Reader(['en', 'ms'], gpu=False)

def extract_text_from_image(image_path):
    """
    Extract text from an image using EasyOCR.
    
    Args:
        image_path (str): Path to the image file
        
    Returns:
        str: Extracted text from the image
    """
    try:
        # Use EasyOCR to extract text
        result = reader.readtext(image_path, detail=0)
        
        # Join all detected text with newlines
        text = '\n'.join(result)
        
        return text
    except FileNotFoundError:
        return f"Error: Image file '{image_path}' not found"
    except Exception as e:
        return f"Error extracting text: {str(e)}"

if __name__ == "__main__":
    # Example usage
    if len(sys.argv) > 1:
        image_path = sys.argv[1]
        print("=" * 60)
        print("Extracting text from:", image_path)
        print("=" * 60)
        
        print("\n--- Extracted Text (EasyOCR) ---")
        text = extract_text_from_image(image_path)
        print(text if text.strip() else "(No text detected)")
        print("-" * 60)
        
    else:
        print("Usage: python read.py <image_path>")
        print("\nExample:")
        print('  python read.py "C:\\path\\to\\image.jpg"')
