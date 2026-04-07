import os
import cv2
import face_recognition

def detect_and_store_unique_faces(input_dir, output_dir):
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    known_encodings = []
    file_number = 0

    for filename in os.listdir(input_dir):
        if filename.lower().endswith('.png'):
            path = os.path.join(input_dir, filename)
            image = face_recognition.load_image_file(path)
            face_locations = face_recognition.face_locations(image,number_of_times_to_upsample=0)

            if not face_locations:
                print(f"No faces detected in {filename}")
                continue

            print(f"{len(face_locations)} faces detected in {filename}")

            for face_location in face_locations:
                face_encoding = face_recognition.face_encodings(image, [face_location])[0]
                if not any(face_recognition.compare_faces(known_encodings, face_encoding, tolerance=0.5)):
                    known_encodings.append(face_encoding)
                    top, right, bottom, left = face_location
                    face_image = image[top:bottom, left:right]
                    face_image_path = os.path.join(output_dir, f"unique_{file_number}.png")
                    cv2.imwrite(face_image_path, cv2.cvtColor(face_image, cv2.COLOR_RGB2BGR))  # Correct way to save images
                    file_number += 1
                    print(f"Stored unique face {file_number} from {filename}")

    print(f"Stored {file_number} unique faces in '{output_dir}'.")

# Example usage
input_directory = 'input'
output_directory = 'UNIQUE'
detect_and_store_unique_faces(input_directory, output_directory)
