from pathlib import Path
import joblib
import re
import nltk

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "sentiment_model.pkl"
STATIC_DIR = BASE_DIR / "static"

for package, resource in [
    ("stopwords", "corpora/stopwords"),
    ("punkt", "tokenizers/punkt"),
    ("punkt_tab", "tokenizers/punkt_tab"),
]:
    try:
        nltk.data.find(resource)
    except LookupError:
        nltk.download(package, quiet=True)

stop_words = set(stopwords.words("english"))
stop_words -= {
    "not", "nor", "no", "never", "none", "nobody",
    "nothing", "neither", "nowhere", "hardly", "barely"
}

app = FastAPI(
    title="Customer Review Sentiment Analysis API",
    description="Predicts Positive, Neutral, or Negative sentiment."
)

# Serves style.css and script.js
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

model = joblib.load(MODEL_PATH) if MODEL_PATH.exists() else None


def preprocess_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"https?://\S+|www\.\S+", "", text)
    text = re.sub(r"\s+", " ", text).strip()

    tokens = word_tokenize(text)
    tokens = [
        word for word in tokens
        if word.isalpha() and word not in stop_words
    ]

    return " ".join(tokens)


class ReviewRequest(BaseModel):
    review: str = Field(..., min_length=1, max_length=10000)


@app.get("/", include_in_schema=False)
def home():
    # The UI now lives at the root URL. API docs are still at /docs
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "model_loaded": model is not None
    }


@app.post("/predict")
def predict_sentiment(request: ReviewRequest):
    if model is None:
        raise HTTPException(
            status_code=503,
            detail="sentiment_model.pkl not found."
        )

    review = request.review.strip()

    if not review:
        raise HTTPException(
            status_code=422,
            detail="Review cannot be empty."
        )

    cleaned_review = preprocess_text(review)

    if not cleaned_review:
        raise HTTPException(
            status_code=422,
            detail="No usable English words found."
        )

    prediction = str(model.predict([cleaned_review])[0])

    return {
        "review": review,
        "cleaned_text": cleaned_review,
        "sentiment": prediction
    }
