class ValidationError(ValueError):
    pass

class ConflictError(ValueError):
    pass

class NotFoundError(LookupError):
    pass

def integer(data, key, minimum=0, maximum=1000000000):
    value = data.get(key)
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValidationError(f'{key} must be an integer from {minimum} to {maximum}')
    return value
