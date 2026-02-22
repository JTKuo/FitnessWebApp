import uvicorn
from fastapi import FastAPI

app = FastAPI(title="Fitness WebApp API")

@app.get("/")
def read_root():
    return {"message": "Welcome to the Fitness WebApp API"}

if __name__ == "__main__":
    uvicorn.run("src.main:app", host="127.0.0.1", port=8000, reload=True)
