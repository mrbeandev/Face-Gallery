import os
import cv2
import face_recognition

def match_and_organize_by_face(unique_dir, input_dir, output_dir):
    unique_faces = [os.path.join(unique_dir, f) for f in os.listdir(unique_dir) if f.endswith('.png')]
    unique_encodings = [face_recognition.face_encodings(face_recognition.load_image_file(face))[0] for face in unique_faces]

    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    for face_path, face_encoding in zip(unique_faces, unique_encodings):
        folder_name = os.path.splitext(os.path.basename(face_path))[0]
        folder_path = os.path.join(output_dir, folder_name)
        os.makedirs(folder_path, exist_ok=True)

        for filename in os.listdir(input_dir):
            if filename.lower().endswith('.png'):
                path = os.path.join(input_dir, filename)
                image = face_recognition.load_image_file(path)
                current_encodings = face_recognition.face_encodings(image)

                for encoding in current_encodings:
                    matches = face_recognition.compare_faces([face_encoding], encoding)
                    if True in matches:
                        cv2.imwrite(os.path.join(folder_path, filename), cv2.cvtColor(image, cv2.COLOR_RGB2BGR))
                        break

        print(f"Processed '{folder_name}'. Matching images are in '{folder_path}'.")

# Example usage
unique_directory = 'UNIQUE'
input_directory = 'input'
output_directory = 'sorted_by_face'
match_and_organize_by_face(unique_directory, input_directory, output_directory)
