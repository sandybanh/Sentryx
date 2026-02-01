import google.generativeai as genai
import os
from datetime import datetime
from dotenv import load_dotenv
load_dotenv()

class GeminiThreatAnalyzer:
    def __init__(self):
        api_key = os.getenv('GEMINI_API_KEY')
        
        if not api_key:
            print("WARNING: GEMINI_API_KEY not set. AI assessment disabled.")
            self.enabled = False
            return
        
        try:
            genai.configure(api_key=api_key)
            self.model = genai.GenerativeModel('gemini-3-flash-preview')
            self.enabled = True
            print("Gemini AI initialized")
        except Exception as e:
            print(f"Gemini init failed: {e}")
            self.enabled = False
    
    def assess_threat(self, person):
        if not self.enabled:
            return "AI unavailable"
        
        try:
            is_known = person.get('is_known', False)
            identity = person.get('identity', 'UNKNOWN')
            confidence = person.get('confidence', 0)
            angle = person.get('tracking', {}).get('angle', 0)
            
            prompt = f"""SECURITY ALERT - {datetime.now().strftime('%I:%M:%S %p')}

            SUBJECT: {identity}
            STATUS: {'AUTHORIZED' if is_known else 'INTRUDER'}
            LOCATION: {angle:.1f}° from camera

            Output format:
            THREAT: [LOW/MEDIUM/HIGH]
            STATUS: [AUTHORIZED/INTRUDER]
            ACTION: [What to do in 15 words]

            Keep recommendations practical for a vehicle personal security system (i.e. Review footage and proceed with caution)."""
            
            response = self.model.generate_content(prompt)
            assessment = response.text.strip()
            
            print(f"AI: {identity} -> {assessment[:500]}")
            return assessment
            
        except Exception as e:
            print(f"AI error: {e}")
            return "Assessment failed"