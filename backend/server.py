from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone
from emergentintegrations.llm.chat import LlmChat, UserMessage
import json
from openai import AsyncOpenAI

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# OpenAI API Key
openai_api_key = os.environ.get('OPENAI_API_KEY')

# Initialize OpenAI client for image generation
openai_client = AsyncOpenAI(api_key=openai_api_key)

# Create the main app without a prefix
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods (GET, POST, OPTIONS, etc.)
    allow_headers=["*"],  # Allow all headers
)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Initialize LLM Chat
def get_llm_chat():
    return LlmChat(
        api_key=openai_api_key,
        session_id="recipe_app_session",
        system_message="""You are a professional chef and nutritionist AI assistant. You help users create delicious recipes based on their available ingredients and dietary preferences.

Your tasks:
1. Generate complete recipes with ingredients and step-by-step instructions
2. Identify missing ingredients and suggest shopping lists
3. Recommend ingredient substitutions when needed
4. Adapt recipes for dietary restrictions (keto, low-carb, baby food)
5. Provide cooking tips and nutritional information

Always respond in valid JSON format with this structure:
{
  "recipe": {
    "name": "Recipe Name",
    "description": "Brief description",
    "prepTime": "15 minutes",
    "cookTime": "30 minutes",
    "servings": 4,
    "difficulty": "Easy/Medium/Hard",
    "ingredients": [
      {"item": "ingredient name", "amount": "1 cup", "essential": true/false}
    ],
    "instructions": [
      "Step 1: ...",
      "Step 2: ..."
    ],
    "nutritionalInfo": {
      "calories": 350,
      "protein": "25g",
      "carbs": "30g",
      "fat": "15g"
    }
  },
  "missingIngredients": [
    {"item": "missing ingredient", "amount": "1 tsp", "reason": "adds flavor"}
  ],
  "substitutions": [
    {"original": "butter", "substitute": "olive oil", "ratio": "1:1", "note": "for dairy-free option"}
  ],
  "tips": [
    "Cooking tip 1",
    "Cooking tip 2"
  ]
}"""
    ).with_model("openai", "gpt-4o")

# Define Models
class RecipeRequest(BaseModel):
    ingredients: List[str]
    dietary_preferences: Optional[List[str]] = []
    meal_type: Optional[str] = "any"
    cuisine: Optional[str] = "any"
    difficulty: Optional[str] = "any"

class Ingredient(BaseModel):
    item: str
    amount: str
    essential: bool = True

class Recipe(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    prep_time: str
    cook_time: str
    servings: int
    difficulty: str
    ingredients: List[Ingredient]
    instructions: List[str]
    nutritional_info: Dict[str, str]
    image_url: Optional[str] = None  # Added image_url field
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RecipeResponse(BaseModel):
    recipe: Recipe
    missing_ingredients: List[Ingredient]
    substitutions: List[Dict[str, str]]
    tips: List[str]

class SavedRecipe(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    recipe_id: str
    recipe_data: Dict
    saved_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

# Helper functions
def prepare_for_mongo(data):
    """Convert datetime objects to ISO strings for MongoDB storage"""
    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, datetime):
                data[key] = value.isoformat()
            elif isinstance(value, dict):
                data[key] = prepare_for_mongo(value)
            elif isinstance(value, list):
                data[key] = [prepare_for_mongo(item) if isinstance(item, dict) else item for item in value]
    return data

def parse_from_mongo(item):
    """Convert ISO strings back to datetime objects"""
    if isinstance(item, dict):
        for key, value in item.items():
            if isinstance(value, str) and key in ['created_at', 'saved_at', 'timestamp']:
                try:
                    item[key] = datetime.fromisoformat(value.replace('Z', '+00:00'))
                except:
                    pass
            elif isinstance(value, dict):
                item[key] = parse_from_mongo(value)
            elif isinstance(value, list):
                item[key] = [parse_from_mongo(i) if isinstance(i, dict) else i for i in value]
    return item

# Recipe generation endpoints
@api_router.post("/generate-recipe", response_model=RecipeResponse)
async def generate_recipe(request: RecipeRequest):
    try:
        # Create the prompt for recipe generation
        ingredients_str = ", ".join(request.ingredients)
        dietary_str = ", ".join(request.dietary_preferences) if request.dietary_preferences else "none"
        
        prompt = f"""Generate a recipe using these available ingredients: {ingredients_str}

Dietary preferences: {dietary_str}
Meal type: {request.meal_type}
Cuisine preference: {request.cuisine}
Difficulty level: {request.difficulty}

Please create a complete recipe, identify any missing essential ingredients, suggest substitutions for dietary restrictions, and provide helpful cooking tips.

Respond only in valid JSON format as specified in your system message."""
        
        # Get AI response for recipe
        llm_chat = get_llm_chat()
        user_message = UserMessage(text=prompt)
        ai_response = await llm_chat.send_message(user_message)
        
        # Parse the JSON response
        try:
            recipe_data = json.loads(ai_response)
        except json.JSONDecodeError:
            import re
            json_match = re.search(r'\{.*\}', ai_response, re.DOTALL)
            if json_match:
                recipe_data = json.loads(json_match.group())
            else:
                raise HTTPException(status_code=500, detail="Invalid AI response format")

        # Create Recipe object
        recipe_dict = recipe_data['recipe']
        
        # Convert nutritional info values to strings
        nutritional_info = recipe_dict['nutritionalInfo']
        nutritional_info_str = {k: str(v) for k, v in nutritional_info.items()}
        
        # Generate image for the recipe
        image_prompt = f"A beautifully plated {recipe_dict['name']}, vibrant colors, appetizing presentation, professional food photography, natural lighting"
        image_response = await openai_client.images.generate(
            model="dall-e-3",
            prompt=image_prompt,
            size="1024x1024",
            quality="standard",
            n=1
        )
        image_url = image_response.data[0].url

        # Create Recipe object with image_url
        recipe = Recipe(
            name=recipe_dict['name'],
            description=recipe_dict['description'],
            prep_time=recipe_dict['prepTime'],
            cook_time=recipe_dict['cookTime'],
            servings=recipe_dict['servings'],
            difficulty=recipe_dict['difficulty'],
            ingredients=[Ingredient(**ing) for ing in recipe_dict['ingredients']],
            instructions=recipe_dict['instructions'],
            nutritional_info=nutritional_info_str,
            image_url=image_url
        )

        # Store recipe in database
        recipe_mongo_data = prepare_for_mongo(recipe.dict())
        await db.recipes.insert_one(recipe_mongo_data)

        # Create missing ingredients list
        missing_ingredients = [Ingredient(**ing) for ing in recipe_data.get('missingIngredients', [])]

        # Create response
        response = RecipeResponse(
            recipe=recipe,
            missing_ingredients=missing_ingredients,
            substitutions=recipe_data.get('substitutions', []),
            tips=recipe_data.get('tips', [])
        )

        return response

    except Exception as e:
        logging.error(f"Error generating recipe or image: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate recipe or image: {str(e)}")

@api_router.get("/recipes", response_model=List[Recipe])
async def get_recipes():
    try:
        recipes = await db.recipes.find().to_list(100)
        return [Recipe(**parse_from_mongo(recipe)) for recipe in recipes]
    except Exception as e:
        logging.error(f"Error fetching recipes: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch recipes")

@api_router.get("/recipes/{recipe_id}", response_model=Recipe)
async def get_recipe(recipe_id: str):
    try:
        recipe = await db.recipes.find_one({"id": recipe_id})
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")
        return Recipe(**parse_from_mongo(recipe))
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error fetching recipe: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch recipe")

@api_router.post("/substitute-ingredient")
async def get_ingredient_substitution(ingredient: str, dietary_restriction: str = None):
    try:
        dietary_context = f" for {dietary_restriction} diet" if dietary_restriction else ""
        prompt = f"""Suggest 3-5 good substitutions for {ingredient}{dietary_context}.

Respond in JSON format:
{{
  "original_ingredient": "{ingredient}",
  "substitutions": [
    {{"substitute": "substitute name", "ratio": "1:1", "note": "why this works"}},
    ...
  ]
}}"""

        llm_chat = get_llm_chat()
        user_message = UserMessage(text=prompt)
        ai_response = await llm_chat.send_message(user_message)
        
        # Parse JSON response
        try:
            substitution_data = json.loads(ai_response)
        except json.JSONDecodeError:
            import re
            json_match = re.search(r'\{.*\}', ai_response, re.DOTALL)
            if json_match:
                substitution_data = json.loads(json_match.group())
            else:
                raise HTTPException(status_code=500, detail="Invalid AI response format")

        return substitution_data

    except Exception as e:
        logging.error(f"Error getting substitution: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get substitution: {str(e)}")

# Basic endpoints
@api_router.get("/")
async def root():
    return {"message": "AI Recipes API is running!"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    status_mongo_data = prepare_for_mongo(status_obj.dict())
    await db.status_checks.insert_one(status_mongo_data)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**parse_from_mongo(status_check)) for status_check in status_checks]

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()