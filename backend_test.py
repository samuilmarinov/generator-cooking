import requests
import sys
import json
from datetime import datetime

class RecipeAPITester:
    def __init__(self, base_url="http://localhost:3000"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}" if not endpoint.startswith('http') else endpoint
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, params=params, timeout=30)

            print(f"   Status Code: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    if isinstance(response_data, dict) and len(str(response_data)) < 500:
                        print(f"   Response: {response_data}")
                    elif isinstance(response_data, list):
                        print(f"   Response: List with {len(response_data)} items")
                    else:
                        print(f"   Response: Large response received")
                except:
                    print(f"   Response: {response.text[:200]}...")
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Error: {response.text[:300]}...")

            return success, response.json() if response.status_code < 400 else {}

        except requests.exceptions.Timeout:
            print(f"❌ Failed - Request timed out after 30 seconds")
            return False, {}
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test the root API endpoint"""
        return self.run_test(
            "Root API Endpoint",
            "GET",
            "",
            200
        )

    def test_status_endpoints(self):
        """Test status check endpoints"""
        # Test POST status
        success, response = self.run_test(
            "Create Status Check",
            "POST",
            "status",
            200,
            data={"client_name": f"test_client_{datetime.now().strftime('%H%M%S')}"}
        )
        
        # Test GET status
        self.run_test(
            "Get Status Checks",
            "GET",
            "status",
            200
        )
        
        return success

    def test_get_recipes(self):
        """Test getting all recipes"""
        return self.run_test(
            "Get All Recipes",
            "GET",
            "recipes",
            200
        )

    def test_generate_recipe(self):
        """Test recipe generation with sample ingredients"""
        sample_request = {
            "ingredients": ["chicken", "tomatoes", "rice"],
            "dietary_preferences": ["keto"],
            "meal_type": "dinner",
            "cuisine": "any",
            "difficulty": "easy"
        }
        
        print(f"   Request data: {sample_request}")
        success, response = self.run_test(
            "Generate Recipe",
            "POST",
            "generate-recipe",
            200,
            data=sample_request
        )
        
        if success and response:
            # Validate response structure
            required_fields = ['recipe', 'missing_ingredients', 'substitutions', 'tips']
            for field in required_fields:
                if field not in response:
                    print(f"❌ Missing field in response: {field}")
                    return False, {}
            
            recipe = response.get('recipe', {})
            recipe_fields = ['id', 'name', 'description', 'ingredients', 'instructions']
            for field in recipe_fields:
                if field not in recipe:
                    print(f"❌ Missing recipe field: {field}")
                    return False, {}
            
            print(f"✅ Recipe generated: {recipe.get('name', 'Unknown')}")
            return True, response
        
        return success, response

    def test_substitute_ingredient(self):
        """Test ingredient substitution"""
        return self.run_test(
            "Get Ingredient Substitution",
            "POST",
            "substitute-ingredient",
            200,
            params={"ingredient": "butter", "dietary_restriction": "vegan"}
        )

    def test_baby_food_recipe(self):
        """Test baby food recipe generation"""
        baby_food_request = {
            "ingredients": ["banana", "apple", "oats"],
            "dietary_preferences": ["baby-food"],
            "meal_type": "any",
            "cuisine": "any",
            "difficulty": "easy"
        }
        
        return self.run_test(
            "Generate Baby Food Recipe",
            "POST",
            "generate-recipe",
            200,
            data=baby_food_request
        )

    def test_low_carb_recipe(self):
        """Test low-carb recipe generation"""
        low_carb_request = {
            "ingredients": ["chicken", "broccoli", "cheese"],
            "dietary_preferences": ["low-carb"],
            "meal_type": "lunch",
            "cuisine": "any",
            "difficulty": "medium"
        }
        
        return self.run_test(
            "Generate Low-Carb Recipe",
            "POST",
            "generate-recipe",
            200,
            data=low_carb_request
        )

def main():
    print("🧪 Starting Pantry to Plate API Testing...")
    print("=" * 60)
    
    tester = RecipeAPITester()
    
    # Test basic endpoints
    print("\n📡 Testing Basic Endpoints...")
    tester.test_root_endpoint()
    tester.test_status_endpoints()
    tester.test_get_recipes()
    
    # Test core recipe functionality
    print("\n🍳 Testing Recipe Generation...")
    tester.test_generate_recipe()
    tester.test_substitute_ingredient()
    
    # Test dietary preferences
    print("\n🥗 Testing Dietary Preferences...")
    tester.test_baby_food_recipe()
    tester.test_low_carb_recipe()
    
    # Print final results
    print("\n" + "=" * 60)
    print(f"📊 Final Results: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed! Backend API is working correctly.")
        return 0
    else:
        failed_tests = tester.tests_run - tester.tests_passed
        print(f"⚠️  {failed_tests} test(s) failed. Please check the issues above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())