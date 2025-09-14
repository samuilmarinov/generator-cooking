import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import axios from 'axios';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Loader2, Plus, Clock, Users, ChefHat, ShoppingCart, Lightbulb, X } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from './components/ui/sonner';

/* ========= Utilities ========= */
const retryRequest = async (fn, retries = 3, delay = 1000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const retriable = error?.code === 'ECONNABORTED' || error?.code === 'ERR_NETWORK';
      if (attempt === retries || !retriable) throw error;
      await new Promise((r) => setTimeout(r, delay * attempt));
    }
  }
};

const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const isMobile =
  typeof navigator !== 'undefined' &&
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

const isIOS =
  (typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))) ||
  false;

// Backend URL selection
const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL || (isLocalhost && isMobile ? null : 'http://localhost:3000');
const API = BACKEND_URL ? `${BACKEND_URL}/api` : null;

/* ========= Mobile floating bubbles overlay (loader) ========= */
function FloatingBubbles({ active, items }) {
  const mobile =
    typeof navigator !== 'undefined' &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  const containerRef = useRef(null);
  const frameRef = useRef(0);
  const dimsRef = useRef({ w: 0, h: 0 });
  const bubblesRef = useRef([]);

  // Build a LARGE pool (more clones) incl. preferences
  const prepared = React.useMemo(() => {
    const base = (items || []).map(String).map((s) => s.trim()).filter(Boolean);
    const unique = Array.from(new Set(base));
    // target count scales with unique size; cap at 100 to avoid jank
    const target = Math.min(100, Math.max(30, unique.length * 7)); // ~7 clones per unique
    if (unique.length === 0) {
      return Array.from({ length: target }, (_, i) => `#${i + 1}`);
    }
    return Array.from({ length: target }, (_, i) => unique[i % unique.length]);
  }, [items]);

  useEffect(() => {
    if (!active || !mobile) return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    dimsRef.current = { w: rect.width, h: rect.height };

    // cleanup previous
    bubblesRef.current.forEach((b) => b.el.remove());
    bubblesRef.current = [];

    const count = prepared.length;
    for (let i = 0; i < count; i++) {
      const text = prepared[i];
      // lively speed variation
      const vx = (Math.random() * 2.4 + 0.8) * (Math.random() < 0.5 ? 1 : -1);
      const vy = (Math.random() * 2.4 + 0.8) * (Math.random() < 0.5 ? 1 : -1);

      const el = document.createElement('div');
      el.className =
        'bubble-chip select-none whitespace-nowrap px-3 py-2 rounded-full text-xs font-medium shadow-lg backdrop-blur-sm';
      el.style.position = 'absolute';
      el.style.left = '0px';
      el.style.top = '0px';
      el.style.transform = 'translate(0,0)';
      el.style.willChange = 'transform';
      el.style.background =
        'linear-gradient(135deg, rgba(255,237,213,0.95), rgba(254,240,199,0.9))';
      el.style.border = '1px solid rgba(253,186,116,0.7)';
      el.style.color = '#7c2d12';

      // subtle random size for variety
      const scale = 0.9 + Math.random() * 0.8; // 0.9x - 1.7x
      el.style.fontSize = `${12 * scale}px`;
      el.style.padding = `${6 * scale}px ${12 * scale}px`;

      el.textContent = text;
      container.appendChild(el);

      // rough placement
      const approxW = 60 * scale + text.length * 6 * scale;
      const approxH = 28 * scale;
      const pad = 8;
      const x = Math.random() * Math.max(1, rect.width - approxW - pad * 2) + pad;
      const y = Math.random() * Math.max(1, rect.height - approxH - pad * 2) + pad;

      bubblesRef.current.push({ text, x, y, vx, vy, el, w: approxW, h: approxH });
    }

    // measure actual size next frame
    requestAnimationFrame(() => {
      bubblesRef.current.forEach((b) => {
        const { width, height } = b.el.getBoundingClientRect();
        if (width) b.w = width;
        if (height) b.h = height;
      });
    });

    const tick = () => {
      const { w, h } = dimsRef.current;
      const friction = 0.998;

      bubblesRef.current.forEach((b) => {
        b.x += b.vx;
        b.y += b.vy;

        // Edge bounce
        if (b.x <= 0) {
          b.x = 0;
          b.vx = Math.abs(b.vx);
        } else if (b.x + b.w >= w) {
          b.x = Math.max(0, w - b.w);
          b.vx = -Math.abs(b.vx);
        }
        if (b.y <= 0) {
          b.y = 0;
          b.vy = Math.abs(b.vy);
        } else if (b.y + b.h >= h) {
          b.y = Math.max(0, h - b.h);
          b.vy = -Math.abs(b.vy);
        }

        b.vx *= friction;
        b.vy *= friction;

        b.el.style.transform = `translate(${b.x}px, ${b.y}px)`;
      });

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    const onResize = () => {
      const r = container.getBoundingClientRect();
      dimsRef.current = { w: r.width, h: r.height };
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', onResize);
      bubblesRef.current.forEach((b) => b.el.remove());
      bubblesRef.current = [];
    };
  }, [active, prepared, mobile]);

  if (!active || !mobile) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[70]"
      style={{
        pointerEvents: 'none', // so it doesn't block the UI
        background:
          'radial-gradient(1200px 600px at 50% -10%, rgba(255,237,213,0.35), rgba(255,247,237,0.25) 30%, rgba(255,255,255,0.05) 65%, transparent 80%)',
      }}
      aria-hidden="true"
    />
  );
}

/* ========= UI bits ========= */
/* NOTE: The original badges stay put (no animation) */
const IngredientBadge = ({ ingredient, onRemove }) => {
  return (
    <div className="inline-flex">
      <Badge variant="secondary" className="bg-orange-100 text-orange-800 flex items-center gap-1">
        {ingredient}
        <X
          className="h-3 w-3 cursor-pointer hover:text-red-600"
          onClick={() => onRemove(ingredient)}
          aria-label={`Remove ${ingredient}`}
        />
      </Badge>
    </div>
  );
};

/* ========= App ========= */
function App() {
  const [ingredients, setIngredients] = useState([]);
  const [currentIngredient, setCurrentIngredient] = useState('');
  const [dietaryPreferences, setDietaryPreferences] = useState([]);
  const [mealType, setMealType] = useState('any');
  const [cuisine, setCuisine] = useState('any');
  const [difficulty, setDifficulty] = useState('any');
  const [loading, setLoading] = useState(false);
  const [recipe, setRecipe] = useState(null);
  const [missingIngredients, setMissingIngredients] = useState([]);
  const [substitutions, setSubstitutions] = useState([]);
  const [tips, setTips] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [activeTab, setActiveTab] = useState('generate');

  // flip (face-down) gesture state
  const [flipEnabled, setFlipEnabled] = useState(false);
  const isSubmittingRef = useRef(false);
  const lastFlipRef = useRef(0);
  const flipDownStartRef = useRef(null);
  const generateBtnRef = useRef(null);
  const lastGestureToastAt = useRef(0);
  const formRef = useRef({ ingredients, mealType, cuisine, difficulty, dietaryPreferences });

  useEffect(() => {
    formRef.current = { ingredients, mealType, cuisine, difficulty, dietaryPreferences };
  }, [ingredients, mealType, cuisine, difficulty, dietaryPreferences]);

  useEffect(() => {
    if (isLocalhost && isMobile && !BACKEND_URL) {
      toast.error(
        'Cannot connect to backend on localhost from a mobile device. Use a public URL or set REACT_APP_BACKEND_URL.'
      );
    } else {
      fetchRecipes();
    }
  }, []);

  const fetchRecipes = async () => {
    if (!API) return;
    try {
      const response = await retryRequest(() => axios.get(`${API}/recipes`, { timeout: 10000 }));
      setRecipes(response.data || []);
    } catch (error) {
      console.error('Error fetching recipes:', error);
      toast.error('Failed to fetch saved recipes. Please check your connection.');
    }
  };

  /* ====== Permissions (flip uses device orientation) ====== */
  const requestFlipPermission = async () => {
    try {
      if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function'
      ) {
        const state = await DeviceOrientationEvent.requestPermission();
        if (state !== 'granted') {
          setFlipEnabled(false);
          toast.info('Motion permission denied. You can still tap Generate.');
          return;
        }
      }
      setFlipEnabled(true);
      toast.success('Flip-to-generate enabled! Face the phone down for ~0.7s to trigger.');
    } catch (err) {
      console.error('DeviceOrientation permission error:', err);
      setFlipEnabled(false);
      toast.error('Failed to enable flip-to-generate.');
    }
  };

  /* ====== Helpers ====== */
  const blurActiveEditable = () => {
    const el = document.activeElement;
    if (!el) return;
    const isEditable =
      el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
    if (isEditable) el.blur();
  };

  /* ====== Flip handler (iOS-friendly) ====== */
  const handleDeviceOrientation = (event) => {
    if (document.hidden) return;

    const { beta, gamma } = event;
    if (beta == null || gamma == null) return;

    const faceDown = Math.abs(beta) > 150 && Math.abs(gamma) < 45;
    const now = Date.now();

    const HOLD_MS = 700;
    const DEBOUNCE_MS = 2000;

    if (faceDown) {
      if (!flipDownStartRef.current) flipDownStartRef.current = now;

      const held = now - flipDownStartRef.current;
      if (held > HOLD_MS && now - lastFlipRef.current > DEBOUNCE_MS) {
        lastFlipRef.current = now;
        flipDownStartRef.current = null;

        blurActiveEditable();

        if (navigator.vibrate) navigator.vibrate(35);

        generateBtnRef.current?.click();
        generateRecipe(null);

        if (now - lastGestureToastAt.current > 2500) {
          lastGestureToastAt.current = now;
          toast.info('Flip detected… generating recipe!');
        }
      }
    } else {
      flipDownStartRef.current = null;
    }
  };

  /* ====== Attach/remove orientation listener ONLY when enabled ====== */
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) {
        lastFlipRef.current = 0;
        flipDownStartRef.current = null;
      }
    };

    if (!flipEnabled) return;

    if (isIOS && location.protocol !== 'https:') {
      toast.message('Tip: On iPhone/iPad, motion works best over HTTPS.');
    }

    window.addEventListener('deviceorientation', handleDeviceOrientation, true);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flipEnabled]);

  /* ====== UI actions ====== */
  const addIngredient = () => {
    const inputElement = document.querySelector('input[placeholder="Enter an ingredient..."]');
    const inputValue = inputElement?.value.trim() || currentIngredient.trim();

    if (inputValue && !ingredients.includes(inputValue)) {
      setIngredients((prev) => [...prev, inputValue]);
      setCurrentIngredient('');
      if (inputElement) inputElement.value = '';
      toast.success(`${inputValue} added!`);
    } else if (!inputValue) {
      toast.error('Please enter an ingredient');
    }
  };

  const removeIngredient = (ingredientToRemove) => {
    setIngredients((prev) => prev.filter((ingredient) => ingredient !== ingredientToRemove));
  };

  const addDietaryPreference = (preference) => {
    setDietaryPreferences((prev) =>
      prev.includes(preference) ? prev : [...prev, preference]
    );
  };

  const removeDietaryPreference = (preference) => {
    setDietaryPreferences((prev) => prev.filter((pref) => pref !== preference));
  };

  const generateRecipe = useCallback(async (event) => {
    if (event) event.preventDefault();
    if (isSubmittingRef.current || !API) {
      if (!API) {
        toast.error('Backend URL not configured. Set REACT_APP_BACKEND_URL or use a public URL.');
      }
      return;
    }
    isSubmittingRef.current = true;

    const { ingredients, mealType, cuisine, difficulty, dietaryPreferences } = formRef.current;

    if (!ingredients.length) {
      toast.error('Please add at least one ingredient');
      isSubmittingRef.current = false;
      return;
    }
    if (!mealType || !cuisine || !difficulty) {
      toast.error('Please select preferences for meal type, cuisine, and difficulty');
      isSubmittingRef.current = false;
      return;
    }

    setLoading(true);
    try {
      const response = await retryRequest(() =>
        axios.post(
          `${API}/generate-recipe`,
          {
            ingredients,
            dietary_preferences: dietaryPreferences,
            meal_type: mealType,
            cuisine,
            difficulty,
          },
          { timeout: 30000 }
        )
      );

      setRecipe(response.data?.recipe || null);
      setMissingIngredients(response.data?.missing_ingredients || []);
      setSubstitutions(response.data?.substitutions || []);
      setTips(response.data?.tips || []);
      setActiveTab('result');

      toast.success('Recipe generated successfully!');
      fetchRecipes();
    } catch (error) {
      console.error('Error generating recipe:', error);
      if (error?.code === 'ECONNABORTED') {
        toast.error('Request timed out after 30s. Check your network and try again.');
      } else if (error?.code === 'ERR_NETWORK') {
        toast.error('Network error. Ensure the backend is running and reachable.');
      } else if (error?.response) {
        toast.error(`Server error: ${error.response.status}. ${error.response.data?.message || 'Please try again.'}`);
      } else {
        toast.error('Failed to generate recipe. Please try again.');
      }
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  }, []);

  const getSubstitution = async (ingredient) => {
    if (!API) {
      toast.error('Backend URL not configured. Set REACT_APP_BACKEND_URL or use a public URL.');
      return;
    }
    try {
      const response = await retryRequest(() =>
        axios.post(
          `${API}/substitute-ingredient?ingredient=${encodeURIComponent(
            ingredient
          )}&dietary_restriction=${encodeURIComponent(dietaryPreferences.join(', '))}`,
          {},
          { timeout: 10000 }
        )
      );
      const list = response.data?.substitutions || [];
      toast.success(`Found ${list.length} substitutions for ${ingredient}`, {
        description: list.map((sub) => `${sub.substitute} (${sub.ratio})`).join(', '),
      });
    } catch (error) {
      console.error('Error getting substitution:', error);
      toast.error('Failed to get substitutions');
    }
  };

  // Build the list for bubble clones: ingredients + preferences tab selections
  const bubbleItems = [
    ...ingredients,
    mealType !== 'any' ? `Meal: ${mealType}` : null,
    cuisine !== 'any' ? `Cuisine: ${cuisine}` : null,
    difficulty !== 'any' ? `Difficulty: ${difficulty}` : null,
    ...dietaryPreferences.map((d) => `Diet: ${d}`),
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
      <Toaster position="top-right" />

      {/* Bouncing bubbles overlay during generation (mobile) */}
      <FloatingBubbles active={loading} items={bubbleItems} />

      <div className="relative overflow-hidden bg-gradient-to-r from-orange-100 to-amber-100 py-20">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1490645935967-10de6ba17061?crop=entropy&cs=srgb&fm=jpg&q=85')] bg-cover bg-center opacity-20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6 font-['Playfair_Display']">
            Pantry to Plate
          </h1>
          <p className="text-xl md:text-2xl text-gray-700 mb-8 max-w-3xl mx-auto font-['Montserrat']">
            Transform your ingredients into delicious recipes with AI-powered cooking assistance
          </p>
          <div className="flex justify-center gap-4">
            <ChefHat className="h-8 w-8 text-orange-600" />
            <span className="text-orange-600 font-semibold">AI-Powered Recipe Generation</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8 bg-white/70 backdrop-blur-sm">
            <TabsTrigger value="generate" className="flex items-center gap-2">
              <ChefHat className="h-4 w-4" />
              Generate Recipe
            </TabsTrigger>
            <TabsTrigger value="result" className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              Recipe Result
            </TabsTrigger>
            <TabsTrigger value="saved" className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Saved Recipes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Card className="bg-white/80 backdrop-blur-sm border-orange-200 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-orange-800">
                    <Plus className="h-5 w-5" />
                    Your Ingredients
                  </CardTitle>
                  <CardDescription>
                    Add ingredients and <strong>flip your device face-down</strong> to generate a recipe!
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <Input
                      placeholder="Enter an ingredient..."
                      value={currentIngredient}
                      onChange={(e) => setCurrentIngredient(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addIngredient()}
                      className="flex-1"
                      aria-label="Enter an ingredient"
                    />
                    <Button
                      onClick={addIngredient}
                      className="bg-orange-600 hover:bg-orange-700"
                      aria-label="Add ingredient"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={requestFlipPermission}
                      variant="outline"
                      className="bg-amber-100 hover:bg-amber-200"
                      disabled={flipEnabled}
                      aria-label={flipEnabled ? 'Flip enabled' : 'Enable flip-to-generate'}
                    >
                      {flipEnabled ? 'Flip Enabled' : 'Enable Flip'}
                    </Button>
                  </div>

                  {isIOS && !flipEnabled && (
                    <p className="text-xs text-gray-500">
                      On iPhone/iPad, tap “Enable Flip” and allow Motion &amp; Orientation access.
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {ingredients.map((ingredient, index) => (
                      <IngredientBadge
                        key={index}
                        ingredient={ingredient}
                        onRemove={removeIngredient}
                      />
                    ))}
                  </div>
                  {ingredients.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <ChefHat className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No ingredients added yet</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white/80 backdrop-blur-sm border-amber-200 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-amber-800">Recipe Preferences</CardTitle>
                  <CardDescription>Customize your recipe generation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Meal Type</label>
                    <Select value={mealType} onValueChange={setMealType}>
                      <SelectTrigger aria-label="Select meal type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="breakfast">Breakfast</SelectItem>
                        <SelectItem value="lunch">Lunch</SelectItem>
                        <SelectItem value="dinner">Dinner</SelectItem>
                        <SelectItem value="snack">Snack</SelectItem>
                        <SelectItem value="dessert">Dessert</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Cuisine</label>
                    <Select value={cuisine} onValueChange={setCuisine}>
                      <SelectTrigger aria-label="Select cuisine">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="italian">Italian</SelectItem>
                        <SelectItem value="mexican">Mexican</SelectItem>
                        <SelectItem value="asian">Asian</SelectItem>
                        <SelectItem value="indian">Indian</SelectItem>
                        <SelectItem value="mediterranean">Mediterranean</SelectItem>
                        <SelectItem value="american">American</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Difficulty</label>
                    <Select value={difficulty} onValueChange={setDifficulty}>
                      <SelectTrigger aria-label="Select difficulty">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="easy">Easy</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Dietary Preferences</label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {['keto', 'low-carb', 'vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'baby-food'].map(
                        (pref) => (
                          <Button
                            key={pref}
                            variant={dietaryPreferences.includes(pref) ? 'default' : 'outline'}
                            size="sm"
                            onClick={() =>
                              dietaryPreferences.includes(pref)
                                ? removeDietaryPreference(pref)
                                : addDietaryPreference(pref)
                            }
                            className={dietaryPreferences.includes(pref) ? 'bg-amber-600 hover:bg-amber-700' : ''}
                            aria-label={`Toggle ${pref} dietary preference`}
                          >
                            {pref}
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="text-center">
              <Button
                ref={generateBtnRef}
                onClick={generateRecipe}
                onTouchEnd={generateRecipe}
                disabled={loading || ingredients.length === 0 || isSubmittingRef.current || !API}
                size="lg"
                className={`bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white px-8 py-3 text-lg font-semibold shadow-lg ${
                  loading || isSubmittingRef.current || !API ? 'opacity-60 cursor-not-allowed' : ''
                }`}
                aria-label="Generate recipe"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Generating Recipe...
                  </>
                ) : (
                  <>
                    <ChefHat className="mr-2 h-5 w-5" />
                    Generate Recipe
                  </>
                )}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="result">
            {recipe ? (
              <div className="space-y-6">
                <Card className="bg-white/90 backdrop-blur-sm shadow-xl border-orange-200">
                  <CardHeader className="text-center">
                    <div className="relative h-48 mb-4 rounded-lg overflow-hidden bg-gradient-to-r from-orange-400 to-amber-400">
                      <img
                        src={recipe.image_url || 'https://source.unsplash.com/800x400/?food'}
                        alt={recipe.name}
                        className="w-full h-full object-cover opacity-80"
                      />
                      <div className="absolute inset-0 bg-black/20"></div>
                    </div>
                    <CardTitle className="text-3xl font-bold text-gray-900 font-['Playfair_Display']">
                      {recipe.name}
                    </CardTitle>
                    <CardDescription className="text-lg text-gray-600">{recipe.description}</CardDescription>
                    <div className="flex justify-center gap-6 mt-4">
                      <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-orange-600" />
                        <span className="text-sm">
                          {recipe.prep_time} + {recipe.cook_time}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-orange-600" />
                        <span className="text-sm">{recipe.servings} servings</span>
                      </div>
                      <Badge variant="outline" className="border-orange-300 text-orange-700">
                        {recipe.difficulty}
                      </Badge>
                    </div>
                  </CardHeader>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <Card className="bg-white/80 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-orange-800">Ingredients</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {recipe.ingredients.map((ingredient, index) => (
                          <li
                            key={index}
                            className="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0"
                          >
                            <span className="text-gray-800">{ingredient.item}</span>
                            <span className="text-sm text-gray-600 font-medium">{ingredient.amount}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>

                  <Card className="lg:col-span-2 bg-white/80 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-orange-800">Instructions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ol className="space-y-4">
                        {recipe.instructions.map((step, index) => (
                          <li key={index} className="flex gap-4">
                            <div className="flex-shrink-0 w-8 h-8 bg-orange-600 text-white rounded-full flex items-center justify-center font-semibold text-sm">
                              {index + 1}
                            </div>
                            <p className="text-gray-800 leading-relaxed">{step}</p>
                          </li>
                        ))}
                      </ol>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {missingIngredients.length > 0 && (
                    <Card className="bg-red-50 border-red-200">
                      <CardHeader>
                        <CardTitle className="text-red-800 flex items-center gap-2">
                          <ShoppingCart className="h-5 w-5" />
                          Shopping List
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                          {missingIngredients.map((ingredient, index) => (
                            <li key={index} className="flex justify-between items-center">
                              <span className="text-red-800">{ingredient.item}</span>
                              <span className="text-sm text-red-600">{ingredient.amount}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}

                  {substitutions.length > 0 && (
                    <Card className="bg-blue-50 border-blue-200">
                      <CardHeader>
                        <CardTitle className="text-blue-800">Substitutions</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {substitutions.map((sub, index) => (
                            <div key={index} className="text-sm">
                              <div className="font-medium text-blue-800">
                                {sub.original} → {sub.substitute}
                              </div>
                              <div className="text-blue-600">{sub.ratio} - {sub.note}</div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {tips.length > 0 && (
                    <Card className="bg-green-50 border-green-200">
                      <CardHeader>
                        <CardTitle className="text-green-800 flex items-center gap-2">
                          <Lightbulb className="h-5 w-5" />
                          Cooking Tips
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                          {tips.map((tip, index) => (
                            <li key={index} className="text-sm text-green-800">• {tip}</li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {recipe.nutritional_info && (
                  <Card className="bg-purple-50 border-purple-200">
                    <CardHeader>
                      <CardTitle className="text-purple-800">Nutritional Information (per serving)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {Object.entries(recipe.nutritional_info).map(([key, value]) => (
                          <div key={key} className="text-center">
                            <div className="text-2xl font-bold text-purple-800">{value}</div>
                            <div className="text-sm text-purple-600 capitalize">{key}</div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <div className="text-center py-16">
                <ChefHat className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-xl font-semibold text-gray-600 mb-2">No Recipe Generated Yet</h3>
                <p className="text-gray-500">Generate a recipe first to see the results here</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="saved">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recipes.map((savedRecipe) => (
                <Card
                  key={savedRecipe.id || savedRecipe._id || savedRecipe.name}
                  className="bg-white/80 backdrop-blur-sm hover:shadow-lg transition-shadow cursor-pointer"
                >
                  <CardHeader>
                    <CardTitle className="text-lg text-gray-900 font-['Montserrat']">
                      {savedRecipe.name}
                    </CardTitle>
                    <CardDescription className="text-sm text-gray-600">
                      {savedRecipe.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-center text-sm text-gray-500 mb-3">
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {savedRecipe.prep_time}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {savedRecipe.servings}
                      </span>
                    </div>
                    <Badge variant="outline" className="border-orange-300 text-orange-700">
                      {savedRecipe.difficulty}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
              {recipes.length === 0 && (
                <div className="col-span-full text-center py-16">
                  <ShoppingCart className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-xl font-semibold text-gray-600 mb-2">No Saved Recipes</h3>
                  <p className="text-gray-500">Generate some recipes to see them appear here</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default App;
