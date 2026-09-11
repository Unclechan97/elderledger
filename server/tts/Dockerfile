FROM python:3.12-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt
COPY main.py .
EXPOSE 55001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "55001"]
